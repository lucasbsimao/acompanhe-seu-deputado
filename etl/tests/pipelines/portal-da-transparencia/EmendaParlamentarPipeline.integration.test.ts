// SPDX-License-Identifier: AGPL-3.0-or-later

import * as assert from 'node:assert';
import { describe, it, beforeEach, afterEach } from 'node:test';
import nock from 'nock';
import { EmendaParlamentarPipeline } from '../../../src/pipelines/portal-da-transparencia/EmendaParlamentarPipeline';
import { useTestDatabase } from '../../db/setup';
import { TestPoliticianRepository } from '../../db/TestPoliticianRepository';
import { TestEmendaRepository } from '../../db/TestEmendaRepository';

const API_BASE_URL = 'https://api.portaldatransparencia.gov.br';
const FAKE_API_KEY = 'test-api-key-123';
const TEST_YEAR = String(new Date().getFullYear());
const TEST_TYPE = 'Emenda Individual - Transferências com Finalidade Definida';

interface MockEmenda {
  codigoEmenda: string;
  ano: number;
  tipoEmenda: string;
  autor: string;
  nomeAutor: string;
  numeroEmenda: string;
  localidadeDoGasto: string;
  funcao: string;
  subfuncao: string;
  valorEmpenhado: string;
  valorLiquidado: string;
  valorPago: string;
  valorRestoInscrito: string;
  valorRestoCancelado: string;
  valorRestoPago: string;
}

function createMockEmenda(codigo: string, ano = 2024, autor = 'DEPUTADO TESTE'): MockEmenda {
  return {
    codigoEmenda: codigo,
    ano,
    tipoEmenda: 'Emenda Individual - Transferências com Finalidade Definida',
    autor,
    nomeAutor: autor,
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

interface EmendaRow {
  codigo_emenda: string;
  politician_cpf: string | null;
  ano: number;
}
interface CountRow {
  cnt: number;
}

describe('EmendaParlamentarPipeline Integration Tests', () => {
  const { getDb } = useTestDatabase();

  let db: ReturnType<typeof getDb>['db'];
  let politicianRepo: TestPoliticianRepository;
  let emendaRepo: TestEmendaRepository;

  beforeEach(() => {
    db = getDb().db;
    politicianRepo = new TestPoliticianRepository(db);
    emendaRepo = new TestEmendaRepository(db);
    nock.cleanAll();
    process.env.PORTAL_TRANSPARENCIA_API_KEY = FAKE_API_KEY;
  });

  afterEach(() => {
    nock.cleanAll();
    delete process.env.PORTAL_TRANSPARENCIA_API_KEY;
  });

  it('should fetch and persist emendas from a single page', async () => {
    politicianRepo.seedDeputy('12345678901', { name: 'Deputado Teste' });

    const emendas = [createMockEmenda('202400000001'), createMockEmenda('202400000002')];

    // 2 emendas < pageSize (100), so pipeline stops after page 1 without fetching page 2
    nock(API_BASE_URL)
      .get('/api-de-dados/emendas')
      .query({ pagina: '1', tamanhoPagina: '100', ano: TEST_YEAR, tipoEmenda: TEST_TYPE })
      .matchHeader('chave-api-dados', FAKE_API_KEY)
      .reply(200, emendas);

    // Absorb the remaining year×type combos the pipeline loops through
    nock(API_BASE_URL).persist().get('/api-de-dados/emendas').query(true).reply(200, []);

    const pipeline = new EmendaParlamentarPipeline(db);
    await pipeline.execute();

    const rows = db
      .prepare('SELECT * FROM emendas_parlamentares ORDER BY codigo_emenda')
      .all() as EmendaRow[];
    assert.strictEqual(rows.length, 2);
    assert.strictEqual(rows[0].codigo_emenda, '202400000001');
    assert.strictEqual(rows[0].politician_cpf, '12345678901');
    assert.strictEqual(rows[1].codigo_emenda, '202400000002');
    assert.strictEqual(rows[1].politician_cpf, '12345678901');
    assert.ok(nock.isDone(), 'All HTTP mocks should be called');
  });

  it('should stop fetching when a page returns fewer records than pageSize', async () => {
    politicianRepo.seedDeputy('12345678901', { name: 'Deputado Teste' });

    // First page is full (pageSize=100), second is partial — no third request needed
    const page1 = Array.from({ length: 100 }, (_, i) =>
      createMockEmenda(`2024${String(i + 1).padStart(8, '0')}`),
    );
    const page2 = Array.from({ length: 40 }, (_, i) =>
      createMockEmenda(`2024${String(i + 101).padStart(8, '0')}`),
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

    const pipeline = new EmendaParlamentarPipeline(db);
    await pipeline.execute();

    const rows = db.prepare('SELECT COUNT(*) as cnt FROM emendas_parlamentares').get() as CountRow;
    assert.strictEqual(rows.cnt, 140);
    assert.ok(nock.isDone(), 'All HTTP mocks should be called');
  });

  it('should skip download when emendas already exist', async () => {
    emendaRepo.seedEmenda('EXISTING001', 2024);

    // No HTTP mock registered — any network call would throw
    const pipeline = new EmendaParlamentarPipeline(db);
    await pipeline.execute(); // should short-circuit

    const rows = db.prepare('SELECT COUNT(*) as cnt FROM emendas_parlamentares').get() as CountRow;
    assert.strictEqual(rows.cnt, 1, 'Should not have fetched anything new');
    assert.ok(nock.isDone());
  });

  it('should force download even when emendas exist', async () => {
    politicianRepo.seedDeputy('12345678901', { name: 'Deputado Teste' });
    emendaRepo.seedEmenda('EXISTING001', 2024);

    const newEmenda = createMockEmenda('NEW00000001');

    // 1 emenda < pageSize (100), so pipeline stops after page 1
    nock(API_BASE_URL)
      .get('/api-de-dados/emendas')
      .query({ pagina: '1', tamanhoPagina: '100', ano: TEST_YEAR, tipoEmenda: TEST_TYPE })
      .matchHeader('chave-api-dados', FAKE_API_KEY)
      .reply(200, [newEmenda]);

    // Absorb the remaining year×type combos
    nock(API_BASE_URL).persist().get('/api-de-dados/emendas').query(true).reply(200, []);

    const pipeline = new EmendaParlamentarPipeline(db);
    await pipeline.execute(true); // forceDownload = true

    const rows = db.prepare('SELECT COUNT(*) as cnt FROM emendas_parlamentares').get() as CountRow;
    assert.strictEqual(rows.cnt, 2, 'Should have EXISTING001 + NEW00000001');
    assert.ok(nock.isDone());
  });

  it('should retry on 500 errors and eventually succeed', async () => {
    politicianRepo.seedDeputy('12345678901', { name: 'Deputado Teste' });

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

    const pipeline = new EmendaParlamentarPipeline(db);
    await pipeline.execute();

    const rows = db.prepare('SELECT COUNT(*) as cnt FROM emendas_parlamentares').get() as CountRow;
    assert.strictEqual(rows.cnt, 1);
    assert.ok(nock.isDone());
  });

  it('should throw when API_KEY env var is missing', () => {
    delete process.env.PORTAL_TRANSPARENCIA_API_KEY;

    assert.throws(
      () => new EmendaParlamentarPipeline(db),
      /PORTAL_TRANSPARENCIA_API_KEY/,
      'Should throw on missing API key',
    );
  });

  it('should not persist emenda when autor is not found in lookup', async () => {
    // No politician seeded — lookup returns null, pipeline skips the record
    const emenda = createMockEmenda('202400000001', 2024, 'DEPUTADO DESCONHECIDO');

    nock(API_BASE_URL)
      .get('/api-de-dados/emendas')
      .query({ pagina: '1', tamanhoPagina: '100', ano: TEST_YEAR, tipoEmenda: TEST_TYPE })
      .matchHeader('chave-api-dados', FAKE_API_KEY)
      .reply(200, [emenda]);

    // Absorb the remaining year×type combos
    nock(API_BASE_URL).persist().get('/api-de-dados/emendas').query(true).reply(200, []);

    const pipeline = new EmendaParlamentarPipeline(db);
    await pipeline.execute();

    const row = db.prepare('SELECT COUNT(*) as cnt FROM emendas_parlamentares').get() as CountRow;
    assert.strictEqual(row.cnt, 0, 'Unmatched emenda should not be persisted');
    assert.ok(nock.isDone());
  });

  it('should resolve politician_cpf via normalized name matching (accents stripped)', async () => {
    // DB stores name with accents; API returns the same name with accents — both normalize identically
    politicianRepo.seedDeputy('99988877700', { name: 'Deputado João Silva' });
    const emenda = createMockEmenda('202400000099', 2024, 'Deputado João Silva');

    nock(API_BASE_URL)
      .get('/api-de-dados/emendas')
      .query({ pagina: '1', tamanhoPagina: '100', ano: TEST_YEAR, tipoEmenda: TEST_TYPE })
      .matchHeader('chave-api-dados', FAKE_API_KEY)
      .reply(200, [emenda]);

    nock(API_BASE_URL).persist().get('/api-de-dados/emendas').query(true).reply(200, []);

    const pipeline = new EmendaParlamentarPipeline(db);
    await pipeline.execute();

    const row = db
      .prepare('SELECT politician_cpf FROM emendas_parlamentares WHERE codigo_emenda = ?')
      .get('202400000099') as { politician_cpf: string } | undefined;
    assert.ok(row, 'Emenda row should exist');
    assert.strictEqual(row.politician_cpf, '99988877700');
    assert.ok(nock.isDone());
  });

  it('should resolve politician_cpf when API autor is uppercase and DB name has mixed case', async () => {
    // DB name is mixed-case; API sends all-caps — normalizeNameForMatching uppercases both
    politicianRepo.seedDeputy('11122233344', { name: 'Maria Oliveira' });
    const emenda = createMockEmenda('202400000088', 2024, 'MARIA OLIVEIRA');

    nock(API_BASE_URL)
      .get('/api-de-dados/emendas')
      .query({ pagina: '1', tamanhoPagina: '100', ano: TEST_YEAR, tipoEmenda: TEST_TYPE })
      .matchHeader('chave-api-dados', FAKE_API_KEY)
      .reply(200, [emenda]);

    nock(API_BASE_URL).persist().get('/api-de-dados/emendas').query(true).reply(200, []);

    const pipeline = new EmendaParlamentarPipeline(db);
    await pipeline.execute();

    const row = db
      .prepare('SELECT politician_cpf FROM emendas_parlamentares WHERE codigo_emenda = ?')
      .get('202400000088') as { politician_cpf: string } | undefined;
    assert.ok(row, 'Emenda row should exist');
    assert.strictEqual(row.politician_cpf, '11122233344');
    assert.ok(nock.isDone());
  });

  it('should not persist emenda when autor field is empty string', async () => {
    const emenda = createMockEmenda('202400000077', 2024, '');

    nock(API_BASE_URL)
      .get('/api-de-dados/emendas')
      .query({ pagina: '1', tamanhoPagina: '100', ano: TEST_YEAR, tipoEmenda: TEST_TYPE })
      .matchHeader('chave-api-dados', FAKE_API_KEY)
      .reply(200, [emenda]);

    nock(API_BASE_URL).persist().get('/api-de-dados/emendas').query(true).reply(200, []);

    const pipeline = new EmendaParlamentarPipeline(db);
    await pipeline.execute();

    const row = db.prepare('SELECT COUNT(*) as cnt FROM emendas_parlamentares').get() as CountRow;
    assert.strictEqual(row.cnt, 0, 'Empty-author emenda should not be persisted');
    assert.ok(nock.isDone());
  });

  it('should throw when API returns non-array response', async () => {
    nock(API_BASE_URL)
      .get('/api-de-dados/emendas')
      .query({ pagina: '1', tamanhoPagina: '100', ano: TEST_YEAR, tipoEmenda: TEST_TYPE })
      .reply(200, { error: 'unexpected format' });

    // Pipeline throws before reaching other combos — no catch-all needed
    const pipeline = new EmendaParlamentarPipeline(db);

    await assert.rejects(
      async () => pipeline.execute(),
      /Expected an array response/,
      'Should throw on unexpected response format',
    );
  });
});
