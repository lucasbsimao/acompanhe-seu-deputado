import * as assert from 'node:assert';
import { describe, it, beforeEach, afterEach } from 'node:test';
import nock from 'nock';
import { PartiesPipeline } from '../src/pipelines/PartiesPipeline';
import { useTestDatabase } from './db/setup';

const API_BASE_URL = 'https://dadosabertos.camara.leg.br';

function createMockParty(id: number): any {
  return {
    id,
    sigla: `PT${id}`,
    nome: `Party ${id}`,
    uri: `https://dadosabertos.camara.leg.br/api/v2/partidos/${id}`,
  };
}

describe('PartiesETL Integration Tests', () => {
  const { getDb } = useTestDatabase();

  beforeEach(() => {
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  it('should fetch and persist parties data with single page', async () => {
    const parties = Array.from({ length: 10 }, (_, i) => createMockParty(i + 1));

    nock(API_BASE_URL)
      .get('/api/v2/partidos')
      .query({
        ordem: 'ASC',
        ordenarPor: 'sigla',
        pagina: '1',
        itens: '100',
      })
      .reply(200, { dados: parties }, { 'x-total-count': '10' });

    const db = getDb().db;
    const etl = new PartiesPipeline(db);

    await etl.execute();

    const result = db.prepare('SELECT * FROM parties ORDER BY rowid').all() as any[];
    assert.strictEqual(result.length, 10, 'Should contain 10 parties');
    assert.strictEqual(result[0].id, 'pt1', 'First party should have normalized id pt1');
    assert.strictEqual(result[9].id, 'pt10', 'Last party should have normalized id pt10');

    assert.ok(nock.isDone(), 'All HTTP mocks should be called');
  });

  it('should fetch and persist parties data with multiple pages', async () => {
    const page1Parties = Array.from({ length: 100 }, (_, i) => createMockParty(i + 1));
    const page2Parties = Array.from({ length: 100 }, (_, i) => createMockParty(i + 101));
    const page3Parties = Array.from({ length: 50 }, (_, i) => createMockParty(i + 201));

    nock(API_BASE_URL)
      .get('/api/v2/partidos')
      .query({
        ordem: 'ASC',
        ordenarPor: 'sigla',
        pagina: '1',
        itens: '100',
      })
      .reply(200, { dados: page1Parties }, { 'x-total-count': '250' });

    nock(API_BASE_URL)
      .get('/api/v2/partidos')
      .query({
        ordem: 'ASC',
        ordenarPor: 'sigla',
        pagina: '2',
        itens: '100',
      })
      .reply(200, { dados: page2Parties });

    nock(API_BASE_URL)
      .get('/api/v2/partidos')
      .query({
        ordem: 'ASC',
        ordenarPor: 'sigla',
        pagina: '3',
        itens: '100',
      })
      .reply(200, { dados: page3Parties });

    const db = getDb().db;
    const etl = new PartiesPipeline(db);

    await etl.execute();

    const result = db.prepare('SELECT * FROM parties ORDER BY rowid').all() as any[];
    assert.strictEqual(result.length, 250, 'Should contain 250 parties');
    assert.strictEqual(result[0].id, 'pt1', 'First party should have normalized id pt1');
    assert.strictEqual(result[99].id, 'pt100', 'Party at index 99 should have normalized id pt100');
    assert.strictEqual(result[249].id, 'pt250', 'Last party should have normalized id pt250');

    assert.ok(nock.isDone(), 'All HTTP mocks should be called');
  });

  it('should normalize party ids to lowercase without accents', async () => {
    const parties = [
      {
        id: 1,
        sigla: 'PT',
        nome: 'Partido dos Trabalhadores',
        uri: 'https://dadosabertos.camara.leg.br/api/v2/partidos/1',
      },
      {
        id: 2,
        sigla: 'PSDB',
        nome: 'Partido da Social Democracia Brasileira',
        uri: 'https://dadosabertos.camara.leg.br/api/v2/partidos/2',
      },
    ];

    nock(API_BASE_URL)
      .get('/api/v2/partidos')
      .query({
        ordem: 'ASC',
        ordenarPor: 'sigla',
        pagina: '1',
        itens: '100',
      })
      .reply(200, { dados: parties }, { 'x-total-count': '2' });

    const db = getDb().db;
    const etl = new PartiesPipeline(db);

    await etl.execute();

    const result = db.prepare('SELECT * FROM parties ORDER BY rowid').all() as any[];
    assert.strictEqual(result.length, 2, 'Should contain 2 parties');
    assert.strictEqual(result[0].id, 'pt', 'PT should be normalized to pt');
    assert.strictEqual(result[1].id, 'psdb', 'PSDB should be normalized to psdb');
    assert.strictEqual(result[0].acronym, 'PT', 'Acronym should preserve original case');
    assert.strictEqual(result[1].acronym, 'PSDB', 'Acronym should preserve original case');

    assert.ok(nock.isDone(), 'All HTTP mocks should be called');
  });

  it('should retry on 500 errors and eventually succeed', async () => {
    const parties = Array.from({ length: 5 }, (_, i) => createMockParty(i + 1));

    const scope = nock(API_BASE_URL)
      .get('/api/v2/partidos')
      .query({
        ordem: 'ASC',
        ordenarPor: 'sigla',
        pagina: '1',
        itens: '100',
      })
      .times(3)
      .reply(500, 'Internal Server Error');

    nock(API_BASE_URL)
      .get('/api/v2/partidos')
      .query({
        ordem: 'ASC',
        ordenarPor: 'sigla',
        pagina: '1',
        itens: '100',
      })
      .reply(200, { dados: parties }, { 'x-total-count': '5' });

    const db = getDb().db;
    const etl = new PartiesPipeline(db);

    await etl.execute();

    const result = db.prepare('SELECT * FROM parties').all() as any[];
    assert.strictEqual(result.length, 5, 'Should contain 5 parties after retries');

    assert.strictEqual(scope.pendingMocks().length, 0, 'All 3 retry mocks should have been called');
  });

  it('should retry on 429 rate limit errors', async () => {
    const parties = Array.from({ length: 5 }, (_, i) => createMockParty(i + 1));

    const scope = nock(API_BASE_URL);

    scope
      .get('/api/v2/partidos')
      .query({
        ordem: 'ASC',
        ordenarPor: 'sigla',
        pagina: '1',
        itens: '100',
      })
      .reply(429, 'Too Many Requests', { 'Retry-After': '1' });

    scope
      .get('/api/v2/partidos')
      .query({
        ordem: 'ASC',
        ordenarPor: 'sigla',
        pagina: '1',
        itens: '100',
      })
      .reply(200, { dados: parties }, { 'x-total-count': '5' });

    const db = getDb().db;
    const etl = new PartiesPipeline(db);

    await etl.execute();

    const result = db.prepare('SELECT * FROM parties').all() as any[];
    assert.strictEqual(result.length, 5, 'Should contain 5 parties after rate limit retry');

    assert.strictEqual(scope.pendingMocks().length, 0, 'Both endpoint calls (429 and 200) should have been made');
  });

  it('should fail after exhausting all retries', async () => {
    const scope = nock(API_BASE_URL);

    scope
      .get('/api/v2/partidos')
      .query({
        ordem: 'ASC',
        ordenarPor: 'sigla',
        pagina: '1',
        itens: '100',
      })
      .times(4)
      .reply(500, 'Internal Server Error');

    const etl = new PartiesPipeline(getDb().db);

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
      .get('/api/v2/partidos')
      .query({
        ordem: 'ASC',
        ordenarPor: 'sigla',
        pagina: '1',
        itens: '100',
      })
      .reply(200, { dados: [] });

    const etl = new PartiesPipeline(getDb().db);

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
      .get('/api/v2/partidos')
      .query({
        ordem: 'ASC',
        ordenarPor: 'sigla',
        pagina: '1',
        itens: '100',
      })
      .reply(200, { invalid: 'format' }, { 'x-total-count': '10' });

    const etl = new PartiesPipeline(getDb().db);

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
    nock(API_BASE_URL)
      .get('/api/v2/partidos')
      .query({
        ordem: 'ASC',
        ordenarPor: 'sigla',
        pagina: '1',
        itens: '100',
      })
      .reply(200, { dados: Array.from({ length: 100 }, (_, i) => createMockParty(i + 1)) }, { 'x-total-count': '550' });

    for (let page = 2; page <= 6; page++) {
      nock(API_BASE_URL)
        .get('/api/v2/partidos')
        .query({
          ordem: 'ASC',
          ordenarPor: 'sigla',
          pagina: String(page),
          itens: '100',
        })
        .reply(200, {
          dados: Array.from({ length: page === 6 ? 50 : 100 }, (_, i) => createMockParty((page - 1) * 100 + i + 1)),
        });
    }

    const db = getDb().db;
    const etl = new PartiesPipeline(db);

    await etl.execute();

    const result = db.prepare('SELECT * FROM parties ORDER BY id').all() as any[];
    assert.strictEqual(result.length, 550, 'Should contain 550 parties');

    assert.ok(nock.isDone(), 'All HTTP mocks should be called');
  });

  it('should use INSERT OR REPLACE to handle duplicate parties', async () => {
    const parties = [
      {
        id: 1,
        sigla: 'PT',
        nome: 'Partido dos Trabalhadores',
        uri: 'https://dadosabertos.camara.leg.br/api/v2/partidos/1',
      },
    ];

    nock(API_BASE_URL)
      .get('/api/v2/partidos')
      .query({
        ordem: 'ASC',
        ordenarPor: 'sigla',
        pagina: '1',
        itens: '100',
      })
      .reply(200, { dados: parties }, { 'x-total-count': '1' });

    const db = getDb().db;
    const etl = new PartiesPipeline(db);

    await etl.execute();

    let result = db.prepare('SELECT * FROM parties WHERE id = ?').all('pt') as any[];
    assert.strictEqual(result.length, 1, 'Should contain 1 party');
    assert.strictEqual(result[0].name, 'Partido dos Trabalhadores', 'Party name should be correct');

    // Run again with updated data
    nock(API_BASE_URL)
      .get('/api/v2/partidos')
      .query({
        ordem: 'ASC',
        ordenarPor: 'sigla',
        pagina: '1',
        itens: '100',
      })
      .reply(200, { dados: [{ ...parties[0], nome: 'Updated Party Name' }] }, { 'x-total-count': '1' });

    const etl2 = new PartiesPipeline(db);
    await etl2.execute();

    result = db.prepare('SELECT * FROM parties WHERE id = ?').all('pt') as any[];
    assert.strictEqual(result.length, 1, 'Should still contain 1 party');
    assert.strictEqual(result[0].name, 'Updated Party Name', 'Party name should be updated');

    assert.ok(nock.isDone(), 'All HTTP mocks should be called');
  });
});
