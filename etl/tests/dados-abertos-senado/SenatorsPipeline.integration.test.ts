import * as assert from 'node:assert';
import { describe, it, beforeEach, afterEach } from 'node:test';
import nock from 'nock';
import { SenatorsPipeline } from '../../src/pipelines/dados-abertos-senado/SenatorsPipeline';
import { useTestDatabase } from '../db/setup';

const API_BASE_URL = 'https://legis.senado.leg.br';

function createMockSenator(id: number, uf: string = 'SP'): any {
  return {
    IdentificacaoParlamentar: {
      CodigoParlamentar: String(id),
      NomeParlamentar: `Senator ${id}`,
      SiglaPartidoParlamentar: 'PT',
      UfParlamentar: uf,
      UrlFotoParlamentar: `http://www.senado.leg.br/senadores/img/fotos-oficiais/senador${id}.jpg`,
    },
  };
}

function createMockResponse(senators: any[]): any {
  return {
    ListaParlamentarEmExercicio: {
      Parlamentares: {
        Parlamentar: senators,
      },
    },
  };
}

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

function createMockSenatorDetail(codigo: string): any {
  return {
    DetalheParlamentar: {
      Parlamentar: {
        IdentificacaoParlamentar: {
          CodigoParlamentar: codigo,
          NomeParlamentar: `Senator ${codigo}`,
          SiglaPartidoParlamentar: 'PT',
          UfParlamentar: 'SP',
        },
        DadosBasicosParlamentar: {
          Cpf: makeCPF(Number(codigo)),
        },
      },
    },
  };
}

function seedTSESenatorRows(db: import('better-sqlite3').Database, count: number): void {
  db.prepare('INSERT OR IGNORE INTO parties (id, name, acronym) VALUES (?, ?, ?)').run('pt', 'PT', 'PT');
  const insert = db.prepare(
    "INSERT INTO politicians (cpf, source_api_id, name, uf, party_id, role, photo_url, elected_as) VALUES (?, NULL, ?, 'SP', 'pt', 'SENATOR', NULL, 'ELEITO_POR_QP')"
  );
  const insertAll = db.transaction((n: number) => {
    for (let i = 1; i <= n; i++) {
      insert.run(makeCPF(i), `TSE Senator ${i}`);
    }
  });
  insertAll(count);
}

function seedTSESenatorById(db: import('better-sqlite3').Database, id: number): void {
  db.prepare('INSERT OR IGNORE INTO parties (id, name, acronym) VALUES (?, ?, ?)').run('pt', 'PT', 'PT');
  db.prepare(
    "INSERT INTO politicians (cpf, source_api_id, name, uf, party_id, role, photo_url, elected_as) VALUES (?, NULL, ?, 'SP', 'pt', 'SENATOR', NULL, 'ELEITO_POR_QP')"
  ).run(makeCPF(id), `TSE Senator ${id}`);
}

describe('SenatorsPipeline Integration Tests', () => {
  const { getDb } = useTestDatabase();

  beforeEach(() => {
    nock.cleanAll();
    nock(API_BASE_URL)
      .get(/\/dadosabertos\/senador\/\d+$/)
      .reply(200, function(uri: string) {
        const codigo = uri.split('/').pop()!;
        return createMockSenatorDetail(codigo);
      })
      .persist();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  it('should fetch and persist senators data', async () => {
    const senators = Array.from({ length: 10 }, (_, i) => createMockSenator(i + 1));
    const response = createMockResponse(senators);

    nock(API_BASE_URL)
      .get('/dadosabertos/senador/lista/atual')
      .query({ participacao: 'T', v: '4' })
      .reply(200, response);

    const db = getDb().db;
    seedTSESenatorRows(db, 10);
    const pipeline = new SenatorsPipeline(db);

    await pipeline.execute(true);

    const result = db.prepare('SELECT * FROM politicians WHERE role = ? ORDER BY CAST(source_api_id AS INTEGER)').all('SENATOR') as any[];
    assert.strictEqual(result.length, 10, 'Should contain 10 senators');
    assert.strictEqual(result[0].source_api_id, '1', 'First senator should have source_api_id 1');
    assert.strictEqual(result[0].role, 'SENATOR', 'Role should be SENATOR');
    assert.strictEqual(result[9].source_api_id, '10', 'Last senator should have source_api_id 10');
    assert.strictEqual(result[0].elected_as, 'ELEITO_POR_QP', 'elected_as from TSE should be preserved');

    assert.ok(nock.isDone(), 'All HTTP mocks should be called');
  });

  it('should handle single senator response (object instead of array)', async () => {
    const senator = createMockSenator(1);
    const response = {
      ListaParlamentarEmExercicio: {
        Parlamentares: {
          Parlamentar: senator,
        },
      },
    };

    nock(API_BASE_URL)
      .get('/dadosabertos/senador/lista/atual')
      .query({ participacao: 'T', v: '4' })
      .reply(200, response);

    const db = getDb().db;
    seedTSESenatorById(db, 1);
    const pipeline = new SenatorsPipeline(db);

    await pipeline.execute(true);

    const result = db.prepare('SELECT * FROM politicians WHERE role = ?').all('SENATOR') as any[];
    assert.strictEqual(result.length, 1, 'Should contain 1 senator');
    assert.strictEqual(result[0].source_api_id, '1', 'Senator should have source_api_id 1');

    assert.ok(nock.isDone(), 'All HTTP mocks should be called');
  });

  it('should normalize party ids to lowercase', async () => {
    const senators = [
      {
        IdentificacaoParlamentar: {
          CodigoParlamentar: '1',
          NomeParlamentar: 'Senator One',
          SiglaPartidoParlamentar: 'PT',
          UfParlamentar: 'SP',
          UrlFotoParlamentar: 'http://example.com/photo1.jpg',
        },
      },
      {
        IdentificacaoParlamentar: {
          CodigoParlamentar: '2',
          NomeParlamentar: 'Senator Two',
          SiglaPartidoParlamentar: 'PSDB',
          UfParlamentar: 'RJ',
          UrlFotoParlamentar: 'http://example.com/photo2.jpg',
        },
      },
    ];
    const response = createMockResponse(senators);

    nock(API_BASE_URL)
      .get('/dadosabertos/senador/lista/atual')
      .query({ participacao: 'T', v: '4' })
      .reply(200, response);

    const db = getDb().db;
    seedTSESenatorRows(db, 2);
    const pipeline = new SenatorsPipeline(db);

    await pipeline.execute(true);

    const result = db.prepare('SELECT * FROM politicians WHERE role = ? ORDER BY source_api_id').all('SENATOR') as any[];
    assert.strictEqual(result.length, 2, 'Should contain 2 senators');
    assert.strictEqual(result[0].party_id, 'pt', 'PT should be normalized to pt');
    assert.strictEqual(result[1].party_id, 'psdb', 'PSDB should be normalized to psdb');

    assert.ok(nock.isDone(), 'All HTTP mocks should be called');
  });

  it('should handle senators without photo URLs', async () => {
    const senators = [
      {
        IdentificacaoParlamentar: {
          CodigoParlamentar: '1',
          NomeParlamentar: 'Senator One',
          SiglaPartidoParlamentar: 'PT',
          UfParlamentar: 'SP',
        },
      },
    ];
    const response = createMockResponse(senators);

    nock(API_BASE_URL)
      .get('/dadosabertos/senador/lista/atual')
      .query({ participacao: 'T', v: '4' })
      .reply(200, response);

    const db = getDb().db;
    seedTSESenatorById(db, 1);
    const pipeline = new SenatorsPipeline(db);

    await pipeline.execute(true);

    const result = db.prepare('SELECT * FROM politicians WHERE role = ?').all('SENATOR') as any[];
    assert.strictEqual(result.length, 1, 'Should contain 1 senator');
    assert.strictEqual(result[0].photo_url, null, 'Photo URL should be null');

    assert.ok(nock.isDone(), 'All HTTP mocks should be called');
  });

  it('should store photo URLs correctly', async () => {
    const senators = [
      {
        IdentificacaoParlamentar: {
          CodigoParlamentar: '5672',
          NomeParlamentar: 'Alan Rick',
          SiglaPartidoParlamentar: 'REPUBLICANOS',
          UfParlamentar: 'AC',
          UrlFotoParlamentar: 'http://www.senado.leg.br/senadores/img/fotos-oficiais/senador5672.jpg',
        },
      },
    ];
    const response = createMockResponse(senators);

    nock(API_BASE_URL)
      .get('/dadosabertos/senador/lista/atual')
      .query({ participacao: 'T', v: '4' })
      .reply(200, response);

    const db = getDb().db;
    seedTSESenatorById(db, 5672);
    const pipeline = new SenatorsPipeline(db);

    await pipeline.execute(true);

    const result = db.prepare('SELECT * FROM politicians WHERE role = ?').all('SENATOR') as any[];
    assert.strictEqual(result.length, 1, 'Should contain 1 senator');
    assert.strictEqual(
      result[0].photo_url,
      'http://www.senado.leg.br/senadores/img/fotos-oficiais/senador5672.jpg',
      'Photo URL should be stored correctly'
    );

    assert.ok(nock.isDone(), 'All HTTP mocks should be called');
  });

  it('should retry on 500 errors and eventually succeed', async () => {
    const senators = Array.from({ length: 5 }, (_, i) => createMockSenator(i + 1));
    const response = createMockResponse(senators);

    const scope = nock(API_BASE_URL)
      .get('/dadosabertos/senador/lista/atual')
      .query({ participacao: 'T', v: '4' })
      .times(3)
      .reply(500, 'Internal Server Error');

    nock(API_BASE_URL)
      .get('/dadosabertos/senador/lista/atual')
      .query({ participacao: 'T', v: '4' })
      .reply(200, response);

    const db = getDb().db;
    seedTSESenatorRows(db, 5);
    const pipeline = new SenatorsPipeline(db);

    await pipeline.execute(true);

    const result = db.prepare('SELECT * FROM politicians WHERE role = ?').all('SENATOR') as any[];
    assert.strictEqual(result.length, 5, 'Should contain 5 senators after retries');

    assert.strictEqual(scope.pendingMocks().length, 0, 'All 3 retry mocks should have been called');
  });

  it('should retry on 429 rate limit errors', async () => {
    const senators = Array.from({ length: 5 }, (_, i) => createMockSenator(i + 1));
    const response = createMockResponse(senators);

    const scope = nock(API_BASE_URL);

    scope
      .get('/dadosabertos/senador/lista/atual')
      .query({ participacao: 'T', v: '4' })
      .reply(429, 'Too Many Requests', { 'Retry-After': '1' });

    scope
      .get('/dadosabertos/senador/lista/atual')
      .query({ participacao: 'T', v: '4' })
      .reply(200, response);

    const db = getDb().db;
    seedTSESenatorRows(db, 5);
    const pipeline = new SenatorsPipeline(db);

    await pipeline.execute(true);

    const result = db.prepare('SELECT * FROM politicians WHERE role = ?').all('SENATOR') as any[];
    assert.strictEqual(result.length, 5, 'Should contain 5 senators after rate limit retry');

    assert.strictEqual(scope.pendingMocks().length, 0, 'Both endpoint calls (429 and 200) should have been made');
  });

  it('should fail after exhausting all retries', async () => {
    const scope = nock(API_BASE_URL);

    scope
      .get('/dadosabertos/senador/lista/atual')
      .query({ participacao: 'T', v: '4' })
      .times(4)
      .reply(500, 'Internal Server Error');

    const pipeline = new SenatorsPipeline(getDb().db);

    await assert.rejects(
      async () => await pipeline.execute(),
      (error: any) => {
        assert.ok(error.message.includes('500'), 'Error should mention status 500');
        return true;
      },
      'Should throw error after exhausting retries'
    );

    assert.strictEqual(scope.pendingMocks().length, 0, 'All 4 endpoint calls should have been made');
  });

  it('should handle invalid response format', async () => {
    nock(API_BASE_URL)
      .get('/dadosabertos/senador/lista/atual')
      .query({ participacao: 'T', v: '4' })
      .reply(200, { invalid: 'format' });

    const pipeline = new SenatorsPipeline(getDb().db);

    await assert.rejects(
      async () => await pipeline.execute(),
      (error: any) => {
        assert.ok(
          error.message.includes('Response does not contain Parlamentar data'),
          'Error should mention invalid response format'
        );
        return true;
      },
      'Should throw error for invalid response format'
    );
  });

  it('should handle missing nested data structure', async () => {
    nock(API_BASE_URL)
      .get('/dadosabertos/senador/lista/atual')
      .query({ participacao: 'T', v: '4' })
      .reply(200, {
        ListaParlamentarEmExercicio: {
          Parlamentares: {},
        },
      });

    const pipeline = new SenatorsPipeline(getDb().db);

    await assert.rejects(
      async () => await pipeline.execute(),
      (error: any) => {
        assert.ok(
          error.message.includes('Response does not contain Parlamentar data'),
          'Error should mention missing Parlamentar data'
        );
        return true;
      },
      'Should throw error for missing Parlamentar data'
    );
  });

  it('should skip download when senators already exist', async () => {
    const db = getDb().db;
    seedTSESenatorRows(db, 3);

    const pipeline = new SenatorsPipeline(db);
    await pipeline.execute(false);

    const result = db.prepare('SELECT COUNT(*) as count FROM politicians WHERE role = ?').get('SENATOR') as any;
    assert.strictEqual(result.count, 3, 'Should still contain 3 senators (no re-download)');
  });

  it('should force download when forceDownload flag is true', async () => {
    const senators = Array.from({ length: 5 }, (_, i) => createMockSenator(i + 1));
    const response = createMockResponse(senators);

    nock(API_BASE_URL)
      .get('/dadosabertos/senador/lista/atual')
      .query({ participacao: 'T', v: '4' })
      .reply(200, response);

    const db = getDb().db;
    seedTSESenatorRows(db, 5);
    const pipeline = new SenatorsPipeline(db);

    await pipeline.execute(true);

    const result = db.prepare('SELECT COUNT(*) as count FROM politicians WHERE role = ?').get('SENATOR') as any;
    assert.strictEqual(result.count, 5, 'Should contain 5 senators after force download');

    assert.ok(nock.isDone(), 'HTTP mock should be called with forceDownload=true');
  });

  it('should correctly map all senator fields', async () => {
    const senators = [
      {
        IdentificacaoParlamentar: {
          CodigoParlamentar: '5672',
          NomeParlamentar: 'Alan Rick',
          SiglaPartidoParlamentar: 'REPUBLICANOS',
          UfParlamentar: 'AC',
          UrlFotoParlamentar: 'http://www.senado.leg.br/senadores/img/fotos-oficiais/senador5672.jpg',
        },
      },
    ];
    const response = createMockResponse(senators);

    nock(API_BASE_URL)
      .get('/dadosabertos/senador/lista/atual')
      .query({ participacao: 'T', v: '4' })
      .reply(200, response);

    const db = getDb().db;
    seedTSESenatorById(db, 5672);
    const pipeline = new SenatorsPipeline(db);

    await pipeline.execute(true);

    const result = db.prepare('SELECT * FROM politicians WHERE role = ?').get('SENATOR') as any;
    assert.strictEqual(result.source_api_id, '5672', 'Source API ID should be mapped correctly');
    assert.strictEqual(result.name, 'Alan Rick', 'Name should be mapped correctly');
    assert.strictEqual(result.uf, 'AC', 'UF should be mapped correctly');
    assert.strictEqual(result.party_id, 'republicanos', 'Party ID should be normalized correctly');
    assert.strictEqual(result.role, 'SENATOR', 'Role should be SENATOR');
    assert.strictEqual(
      result.photo_url,
      'http://www.senado.leg.br/senadores/img/fotos-oficiais/senador5672.jpg',
      'Photo URL should be mapped correctly'
    );

    assert.ok(nock.isDone(), 'All HTTP mocks should be called');
  });

  it('should handle senators from different states', async () => {
    const senators = [
      createMockSenator(1, 'SP'),
      createMockSenator(2, 'RJ'),
      createMockSenator(3, 'MG'),
      createMockSenator(4, 'BA'),
    ];
    const response = createMockResponse(senators);

    nock(API_BASE_URL)
      .get('/dadosabertos/senador/lista/atual')
      .query({ participacao: 'T', v: '4' })
      .reply(200, response);

    const db = getDb().db;
    seedTSESenatorRows(db, 4);
    const pipeline = new SenatorsPipeline(db);

    await pipeline.execute(true);

    const result = db.prepare('SELECT DISTINCT uf FROM politicians WHERE role = ? ORDER BY uf').all('SENATOR') as any[];
    assert.strictEqual(result.length, 4, 'Should have senators from 4 different states');
    assert.strictEqual(result[0].uf, 'BA', 'Should have senator from BA');
    assert.strictEqual(result[1].uf, 'MG', 'Should have senator from MG');
    assert.strictEqual(result[2].uf, 'RJ', 'Should have senator from RJ');
    assert.strictEqual(result[3].uf, 'SP', 'Should have senator from SP');

    assert.ok(nock.isDone(), 'All HTTP mocks should be called');
  });
});
