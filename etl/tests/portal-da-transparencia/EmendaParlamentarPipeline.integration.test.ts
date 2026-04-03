import * as assert from 'node:assert';
import { describe, it, beforeEach, afterEach } from 'node:test';
import nock from 'nock';
import { EmendaParlamentarPipeline } from '../../src/pipelines/portal-da-transparencia/EmendaParlamentarPipeline';
import { useTestDatabase } from '../db/setup';

const API_BASE_URL = 'https://api.portaldatransparencia.gov.br';
const FAKE_API_KEY = 'test-api-key-123';
const TEST_YEAR = String(new Date().getFullYear());
const TEST_TYPE = 'Emenda Individual - Transferências com Finalidade Definida';

function createMockEmenda(codigo: string, ano = 2024): any {
  return {
    codigoEmenda: codigo,
    ano,
    tipoEmenda: 'Emenda Individual - Transferências com Finalidade Definida',
    autor: 'DEPUTADO TESTE',
    nomeAutor: 'DEPUTADO TESTE',
    numeroEmenda: '0001',
    localidadeDoGasto: 'Nacional',
    funcao: 'Saúde',
    subfuncao: 'Atenção Básica',
    valorEmpenhado: '100.000,00',
    valorLiquidado: '80.000,00',
    valorPago: '80.000,00',
    valorRestoInscrito: '20.000,00',
    valorRestoCancelado: '0,00',
    valorRestoPago: '0,00',
  };
}

describe('EmendaParlamentarPipeline Integration Tests', () => {
  const { getDb } = useTestDatabase();

  beforeEach(() => {
    nock.cleanAll();
    process.env.PORTAL_TRANSPARENCIA_API_KEY = FAKE_API_KEY;
  });

  afterEach(() => {
    nock.cleanAll();
    delete process.env.PORTAL_TRANSPARENCIA_API_KEY;
  });

  it('should fetch and persist emendas from a single page', async () => {
    const emendas = [createMockEmenda('202400000001'), createMockEmenda('202400000002')];

    // 2 emendas < pageSize (100), so pipeline stops after page 1 without fetching page 2
    nock(API_BASE_URL)
      .get('/api-de-dados/emendas')
      .query({ pagina: '1', tamanhoPagina: '100', ano: TEST_YEAR, tipoEmenda: TEST_TYPE })
      .matchHeader('chave-api-dados', FAKE_API_KEY)
      .reply(200, emendas);

    // Absorb the remaining year×type combos the pipeline loops through
    nock(API_BASE_URL).persist().get('/api-de-dados/emendas').query(true).reply(200, []);

    const pipeline = new EmendaParlamentarPipeline(getDb().db);
    await pipeline.execute();

    const rows = getDb().db
      .prepare('SELECT * FROM emendas_parlamentares ORDER BY codigo_emenda')
      .all() as any[];
    assert.strictEqual(rows.length, 2);
    assert.strictEqual(rows[0].codigo_emenda, '202400000001');
    assert.strictEqual(rows[1].codigo_emenda, '202400000002');
    assert.ok(nock.isDone(), 'All HTTP mocks should be called');
  });

  it('should stop fetching when a page returns fewer records than pageSize', async () => {
    // First page is full (pageSize=100), second is partial — no third request needed
    const page1 = Array.from({ length: 100 }, (_, i) =>
      createMockEmenda(`2024${String(i + 1).padStart(8, '0')}`)
    );
    const page2 = Array.from({ length: 40 }, (_, i) =>
      createMockEmenda(`2024${String(i + 101).padStart(8, '0')}`)
    );

    nock(API_BASE_URL)
      .get('/api-de-dados/emendas')
      .query({ pagina: '1', tamanhoPagina: '100', ano: TEST_YEAR, tipoEmenda: TEST_TYPE })
      .matchHeader('chave-api-dados', FAKE_API_KEY)
      .reply(200, page1);

    nock(API_BASE_URL)
      .get('/api-de-dados/emendas')
      .query({ pagina: '2', tamanhoPagina: '100', ano: TEST_YEAR, tipoEmenda: TEST_TYPE })
      .matchHeader('chave-api-dados', FAKE_API_KEY)
      .reply(200, page2);

    // Absorb the remaining year×type combos
    nock(API_BASE_URL).persist().get('/api-de-dados/emendas').query(true).reply(200, []);

    const pipeline = new EmendaParlamentarPipeline(getDb().db);
    await pipeline.execute();

    const rows = getDb().db
      .prepare('SELECT COUNT(*) as cnt FROM emendas_parlamentares')
      .get() as any;
    assert.strictEqual(rows.cnt, 140);
    assert.ok(nock.isDone(), 'All HTTP mocks should be called');
  });

  it('should skip download when emendas already exist', async () => {
    // Prepopulate one row directly
    getDb().db.exec(`
      INSERT INTO emendas_parlamentares (codigo_emenda, ano) VALUES ('EXISTING001', 2024)
    `);

    // No HTTP mock registered — any network call would throw
    const pipeline = new EmendaParlamentarPipeline(getDb().db);
    await pipeline.execute(); // should short-circuit

    const rows = getDb().db
      .prepare('SELECT COUNT(*) as cnt FROM emendas_parlamentares')
      .get() as any;
    assert.strictEqual(rows.cnt, 1, 'Should not have fetched anything new');
    assert.ok(nock.isDone());
  });

  it('should force download even when emendas exist', async () => {
    getDb().db.exec(`
      INSERT INTO emendas_parlamentares (codigo_emenda, ano) VALUES ('EXISTING001', 2024)
    `);

    const newEmenda = createMockEmenda('NEW00000001');

    // 1 emenda < pageSize (100), so pipeline stops after page 1
    nock(API_BASE_URL)
      .get('/api-de-dados/emendas')
      .query({ pagina: '1', tamanhoPagina: '100', ano: TEST_YEAR, tipoEmenda: TEST_TYPE })
      .matchHeader('chave-api-dados', FAKE_API_KEY)
      .reply(200, [newEmenda]);

    // Absorb the remaining year×type combos
    nock(API_BASE_URL).persist().get('/api-de-dados/emendas').query(true).reply(200, []);

    const pipeline = new EmendaParlamentarPipeline(getDb().db);
    await pipeline.execute(true); // forceDownload = true

    const rows = getDb().db
      .prepare('SELECT COUNT(*) as cnt FROM emendas_parlamentares')
      .get() as any;
    assert.strictEqual(rows.cnt, 2, 'Should have EXISTING001 + NEW00000001');
    assert.ok(nock.isDone());
  });

  it('should retry on 500 errors and eventually succeed', async () => {
    const emenda = createMockEmenda('202400000001');

    nock(API_BASE_URL)
      .get('/api-de-dados/emendas')
      .query({ pagina: '1', tamanhoPagina: '100', ano: TEST_YEAR, tipoEmenda: TEST_TYPE })
      .times(3)
      .reply(500, 'Internal Server Error');

    // 1 emenda < pageSize (100), so pipeline stops after page 1 success
    nock(API_BASE_URL)
      .get('/api-de-dados/emendas')
      .query({ pagina: '1', tamanhoPagina: '100', ano: TEST_YEAR, tipoEmenda: TEST_TYPE })
      .reply(200, [emenda]);

    // Absorb the remaining year×type combos
    nock(API_BASE_URL).persist().get('/api-de-dados/emendas').query(true).reply(200, []);

    const pipeline = new EmendaParlamentarPipeline(getDb().db);
    await pipeline.execute();

    const rows = getDb().db
      .prepare('SELECT COUNT(*) as cnt FROM emendas_parlamentares')
      .get() as any;
    assert.strictEqual(rows.cnt, 1);
    assert.ok(nock.isDone());
  });

  it('should throw when API_KEY env var is missing', async () => {
    delete process.env.PORTAL_TRANSPARENCIA_API_KEY;

    assert.throws(
      () => new EmendaParlamentarPipeline(getDb().db),
      /PORTAL_TRANSPARENCIA_API_KEY/,
      'Should throw on missing API key'
    );
  });

  it('should throw when API returns non-array response', async () => {
    nock(API_BASE_URL)
      .get('/api-de-dados/emendas')
      .query({ pagina: '1', tamanhoPagina: '100', ano: TEST_YEAR, tipoEmenda: TEST_TYPE })
      .reply(200, { error: 'unexpected format' });

    // Pipeline throws before reaching other combos — no catch-all needed
    const pipeline = new EmendaParlamentarPipeline(getDb().db);

    await assert.rejects(
      async () => pipeline.execute(),
      /Expected an array response/,
      'Should throw on unexpected response format'
    );
  });
});
