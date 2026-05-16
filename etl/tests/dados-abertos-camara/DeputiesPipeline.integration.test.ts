import * as assert from 'node:assert';
import { describe, it, beforeEach, afterEach } from 'node:test';
import nock from 'nock';
import { DeputiesPipeline } from '../../src/pipelines/dados-abertos-camara/DeputiesPipeline';
import { useTestDatabase } from '../db/setup';

const API_BASE_URL = 'https://dadosabertos.camara.leg.br';

function createMockDeputy(id: number): any {
  return {
    id,
    nome: `Deputy ${id}`,
    siglaPartido: 'PT',
    siglaUf: 'SP',
    urlFoto: `https://example.com/photo${id}.jpg`,
  };
}

const LEGIS_ID = 57;

function makeCPF(id: number): string {
  const base = String(id).padStart(9, '0');
  const digits = base.split('').map(Number);
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += digits[i] * (10 - i);
  }
  let d1 = 11 - (sum % 11);
  if (d1 >= 10) d1 = 0;
  digits.push(d1);
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += digits[i] * (11 - i);
  }
  let d2 = 11 - (sum % 11);
  if (d2 >= 10) d2 = 0;
  digits.push(d2);
  return digits.join('');
}

function createMockDeputyDetail(id: number): any {
  return {
    dados: {
      id,
      cpf: makeCPF(id),
      nomeCivil: `Deputy ${id}`,
      siglaPartido: 'PT',
      siglaUf: 'SP',
      urlFoto: `https://example.com/photo${id}.jpg`,
    },
  };
}

function seedTSEDeputyRows(db: import('better-sqlite3').Database, count: number): void {
  db.prepare('INSERT OR IGNORE INTO parties (id, name, acronym) VALUES (?, ?, ?)').run('pt', 'PT', 'PT');
  const insert = db.prepare(
    "INSERT INTO politicians (cpf, source_api_id, name, uf, party_id, role, photo_url, elected_as) VALUES (?, NULL, ?, 'SP', 'pt', 'DEPUTY', NULL, 'ELEITO_POR_QP')"
  );
  const insertAll = db.transaction((n: number) => {
    for (let i = 1; i <= n; i++) {
      insert.run(makeCPF(i), `TSE Deputy ${i}`);
    }
  });
  insertAll(count);
}

describe('DeputiesETL Integration Tests', () => {
  const { getDb } = useTestDatabase();

  beforeEach(() => {
    nock.cleanAll();
    nock(API_BASE_URL)
      .get('/api/v2/legislaturas')
      .query({ ordem: 'DESC', ordenarPor: 'id', itens: '1' })
      .reply(200, { dados: [{ id: LEGIS_ID }] })
      .persist();
    nock(API_BASE_URL)
      .get(/\/api\/v2\/deputados\/\d+$/)
      .reply(200, function(uri: string) {
        const id = Number(uri.split('/').pop()!);
        return createMockDeputyDetail(id);
      })
      .persist();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  it('should fetch and persist deputies data with single page', async () => {
    const deputies = Array.from({ length: 10 }, (_, i) => createMockDeputy(i + 1));

    nock(API_BASE_URL)
      .get('/api/v2/deputados')
      .query({
        ordem: 'ASC',
        ordenarPor: 'id',
        idLegislatura: String(LEGIS_ID),
        pagina: '1',
        itens: '100',
      })
      .reply(200, { dados: deputies }, { 'x-total-count': '10' });

    const db = getDb().db;
    seedTSEDeputyRows(db, 10);
    const etl = new DeputiesPipeline(db, 1);

    await etl.execute(true);

    const result = db.prepare('SELECT * FROM politicians ORDER BY CAST(source_api_id AS INTEGER)').all() as any[];
    assert.strictEqual(result.length, 10, 'Should contain 10 deputies');
    assert.strictEqual(result[0].source_api_id, '1', 'First deputy should have source_api_id 1');
    assert.strictEqual(result[9].source_api_id, '10', 'Last deputy should have source_api_id 10');
    assert.strictEqual(result[0].elected_as, 'ELEITO_POR_QP', 'elected_as from TSE should be preserved');

    assert.ok(nock.isDone(), 'All HTTP mocks should be called');
  });

  it('should fetch and persist deputies data with multiple pages', async () => {
    const page1Deputies = Array.from({ length: 100 }, (_, i) => createMockDeputy(i + 1));
    const page2Deputies = Array.from({ length: 100 }, (_, i) => createMockDeputy(i + 101));
    const page3Deputies = Array.from({ length: 50 }, (_, i) => createMockDeputy(i + 201));
    seedTSEDeputyRows(getDb().db, 250);

    nock(API_BASE_URL)
      .get('/api/v2/deputados')
      .query({
        ordem: 'ASC',
        ordenarPor: 'id',
        idLegislatura: String(LEGIS_ID),
        pagina: '1',
        itens: '100',
      })
      .reply(200, { dados: page1Deputies }, { 'x-total-count': '250' });

    nock(API_BASE_URL)
      .get('/api/v2/deputados')
      .query({
        ordem: 'ASC',
        ordenarPor: 'id',
        idLegislatura: String(LEGIS_ID),
        pagina: '2',
        itens: '100',
      })
      .reply(200, { dados: page2Deputies });

    nock(API_BASE_URL)
      .get('/api/v2/deputados')
      .query({
        ordem: 'ASC',
        ordenarPor: 'id',
        idLegislatura: String(LEGIS_ID),
        pagina: '3',
        itens: '100',
      })
      .reply(200, { dados: page3Deputies });

    const db = getDb().db;
    const etl = new DeputiesPipeline(db, 1);

    await etl.execute(true);

    const result = db.prepare('SELECT * FROM politicians ORDER BY CAST(source_api_id AS INTEGER)').all() as any[];
    assert.strictEqual(result.length, 250, 'Should contain 250 deputies');
    assert.strictEqual(result[0].source_api_id, '1', 'First deputy should have source_api_id 1');
    assert.strictEqual(result[100].source_api_id, '101', 'Deputy at index 100 should have source_api_id 101');
    assert.strictEqual(result[249].source_api_id, '250', 'Last deputy should have source_api_id 250');

    assert.ok(nock.isDone(), 'All HTTP mocks should be called');
  });

  it('should retry on 500 errors and eventually succeed', async () => {
    const deputies = Array.from({ length: 5 }, (_, i) => createMockDeputy(i + 1));
    seedTSEDeputyRows(getDb().db, 5);

    const scope = nock(API_BASE_URL)
      .get('/api/v2/deputados')
      .query({
        ordem: 'ASC',
        ordenarPor: 'id',
        idLegislatura: String(LEGIS_ID),
        pagina: '1',
        itens: '100',
      })
      .times(3)
      .reply(500, 'Internal Server Error');

    nock(API_BASE_URL)
      .get('/api/v2/deputados')
      .query({
        ordem: 'ASC',
        ordenarPor: 'id',
        idLegislatura: String(LEGIS_ID),
        pagina: '1',
        itens: '100',
      })
      .reply(200, { dados: deputies }, { 'x-total-count': '5' });

    const db = getDb().db;
    const etl = new DeputiesPipeline(db, 1);

    await etl.execute(true);

    const result = db.prepare('SELECT * FROM politicians').all() as any[];
    assert.strictEqual(result.length, 5, 'Should contain 5 deputies after retries');

    assert.strictEqual(scope.pendingMocks().length, 0, 'All 3 retry mocks should have been called');
  });

  it('should retry on 429 rate limit errors', async () => {
    const deputies = Array.from({ length: 5 }, (_, i) => createMockDeputy(i + 1));
    const db = getDb().db;
    seedTSEDeputyRows(db, 5);

    const scope = nock(API_BASE_URL);

    scope
      .get('/api/v2/deputados')
      .query({
        ordem: 'ASC',
        ordenarPor: 'id',
        idLegislatura: String(LEGIS_ID),
        pagina: '1',
        itens: '100',
      })
      .reply(429, 'Too Many Requests', { 'Retry-After': '1' });

    scope
      .get('/api/v2/deputados')
      .query({
        ordem: 'ASC',
        ordenarPor: 'id',
        idLegislatura: String(LEGIS_ID),
        pagina: '1',
        itens: '100',
      })
      .reply(200, { dados: deputies }, { 'x-total-count': '5' });

    const etl = new DeputiesPipeline(db, 1);

    await etl.execute(true);

    const result = db.prepare('SELECT * FROM politicians').all() as any[];
    assert.strictEqual(result.length, 5, 'Should contain 5 deputies after rate limit retry');

    assert.strictEqual(scope.pendingMocks().length, 0, 'Both endpoint calls (429 and 200) should have been made');
  });

  it('should fail after exhausting all retries', async () => {
    const scope = nock(API_BASE_URL);

    scope
      .get('/api/v2/deputados')
      .query({
        ordem: 'ASC',
        ordenarPor: 'id',
        idLegislatura: String(LEGIS_ID),
        pagina: '1',
        itens: '100',
      })
      .times(4)
      .reply(500, 'Internal Server Error');

    const etl = new DeputiesPipeline(getDb().db, 1);

    await assert.rejects(
      async () => await etl.execute(),
      (error: any) => {
        assert.ok(error.message.includes('500'), 'Error should mention status 500');
        return true;
      },
      'Should throw error after exhausting retries'
    );

    assert.strictEqual(scope.pendingMocks().length, 0, 'All 4 endpoint calls should have been made');
  });

  it('should handle missing X-Total-Count header', async () => {
    nock(API_BASE_URL)
      .get('/api/v2/deputados')
      .query({
        ordem: 'ASC',
        ordenarPor: 'id',
        idLegislatura: String(LEGIS_ID),
        pagina: '1',
        itens: '100',
      })
      .reply(200, { dados: [] });

    const etl = new DeputiesPipeline(getDb().db, 1);

    await assert.rejects(
      async () => await etl.execute(),
      (error: any) => {
        assert.ok(
          error.message.includes('Missing X-Total-Count header'),
          'Error should mention missing header'
        );
        return true;
      },
      'Should throw error for missing X-Total-Count header'
    );
  });

  it('should handle invalid response format', async () => {
    nock(API_BASE_URL)
      .get('/api/v2/deputados')
      .query({
        ordem: 'ASC',
        ordenarPor: 'id',
        idLegislatura: String(LEGIS_ID),
        pagina: '1',
        itens: '100',
      })
      .reply(200, { invalid: 'format' }, { 'x-total-count': '10' });

    const etl = new DeputiesPipeline(getDb().db, 1);

    await assert.rejects(
      async () => await etl.execute(),
      (error: any) => {
        assert.ok(
          error.message.includes('Response does not contain dados array'),
          'Error should mention invalid response format'
        );
        return true;
      },
      'Should throw error for invalid response format'
    );
  });

  it('should handle parallel page fetching correctly', async () => {
    seedTSEDeputyRows(getDb().db, 550);

    nock(API_BASE_URL)
      .get('/api/v2/deputados')
      .query({
        ordem: 'ASC',
        ordenarPor: 'id',
        idLegislatura: String(LEGIS_ID),
        pagina: '1',
        itens: '100',
      })
      .reply(200, { dados: Array.from({ length: 100 }, (_, i) => createMockDeputy(i + 1)) }, { 'x-total-count': '550' });

    for (let page = 2; page <= 6; page++) {
      nock(API_BASE_URL)
        .get('/api/v2/deputados')
        .query({
          ordem: 'ASC',
          ordenarPor: 'id',
          idLegislatura: String(LEGIS_ID),
          pagina: String(page),
          itens: '100',
        })
        .reply(200, {
          dados: Array.from({ length: page === 6 ? 50 : 100 }, (_, i) => createMockDeputy((page - 1) * 100 + i + 1)),
        });
    }

    const db = getDb().db;
    const etl = new DeputiesPipeline(db, 1);

    await etl.execute(true);

    const result = db.prepare('SELECT * FROM politicians ORDER BY CAST(source_api_id AS INTEGER)').all() as any[];
    assert.strictEqual(result.length, 550, 'Should contain 550 deputies');

    for (let i = 0; i < 550; i++) {
      assert.strictEqual(result[i].source_api_id, String(i + 1), `Deputy at index ${i} should have source_api_id ${i + 1}`);
    }

    assert.ok(nock.isDone(), 'All HTTP mocks should be called');
  });
});
