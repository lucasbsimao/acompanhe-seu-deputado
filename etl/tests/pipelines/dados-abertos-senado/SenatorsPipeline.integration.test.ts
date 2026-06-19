// SPDX-License-Identifier: AGPL-3.0-or-later

import * as assert from 'node:assert';
import { describe, it, beforeEach, afterEach } from 'node:test';
import nock from 'nock';
import { SenatorsPipeline } from '../../../src/pipelines/dados-abertos-senado/SenatorsPipeline';
import { useTestDatabase } from '../../db/setup';
import { TestPoliticianRepository } from '../../db/TestPoliticianRepository';

const API_BASE_URL = 'https://legis.senado.leg.br';

interface MockSenatorId {
  CodigoParlamentar: string;
  NomeParlamentar: string;
  SiglaPartidoParlamentar: string;
  UfParlamentar: string;
  UrlFotoParlamentar?: string;
}

interface MockSenator {
  IdentificacaoParlamentar: MockSenatorId;
}

function createMockSenator(id: number, uf: string = 'SP'): MockSenator {
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

interface MockSenatorResponse {
  ListaParlamentarEmExercicio: {
    Parlamentares: {
      Parlamentar: MockSenator[];
    };
  };
}

function createMockResponse(senators: MockSenator[]): MockSenatorResponse {
  return {
    ListaParlamentarEmExercicio: {
      Parlamentares: {
        Parlamentar: senators,
      },
    },
  };
}

interface PoliticianRow {
  source_api_id: string;
  name: string;
  uf: string;
  role: string;
  photo_url: string | null;
  elected_as: string | null;
  party_id: string;
  cpf: string;
}

interface CountRow {
  count: number;
}

describe('SenatorsPipeline Integration Tests', () => {
  const { getDb } = useTestDatabase();

  let db: ReturnType<typeof getDb>['db'];
  let politicianRepo: TestPoliticianRepository;

  beforeEach(() => {
    db = getDb().db;
    politicianRepo = new TestPoliticianRepository(db);
    nock.cleanAll();
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

    politicianRepo.seedTSESenatorRows(10);
    const pipeline = new SenatorsPipeline(db);

    await pipeline.execute(true);

    const result = db
      .prepare('SELECT * FROM politicians WHERE role = ? ORDER BY CAST(source_api_id AS INTEGER)')
      .all('SENATOR') as PoliticianRow[];
    assert.strictEqual(result.length, 10, 'Should contain 10 senators');
    assert.strictEqual(result[0].source_api_id, '1', 'First senator should have source_api_id 1');
    assert.strictEqual(result[0].role, 'SENATOR', 'Role should be SENATOR');
    assert.strictEqual(result[9].source_api_id, '10', 'Last senator should have source_api_id 10');
    assert.strictEqual(
      result[0].elected_as,
      'ELEITO_POR_QP',
      'elected_as from TSE should be preserved',
    );

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

    politicianRepo.seedTSESenatorByName(1, 'Senator 1', 'SP', 'PT');
    const pipeline = new SenatorsPipeline(db);

    await pipeline.execute(true);

    const result = db
      .prepare('SELECT * FROM politicians WHERE role = ?')
      .all('SENATOR') as PoliticianRow[];
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

    politicianRepo.seedTSESenatorByName(1, 'Senator One', 'SP', 'PT');
    politicianRepo.seedTSESenatorByName(2, 'Senator Two', 'RJ', 'PSDB');
    const pipeline = new SenatorsPipeline(db);

    await pipeline.execute(true);

    const result = db
      .prepare('SELECT * FROM politicians WHERE role = ? ORDER BY source_api_id')
      .all('SENATOR') as PoliticianRow[];
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
          NomeCompletoParlamentar: 'Senator One Full Name',
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

    politicianRepo.seedTSESenatorByName(1, 'Senator One', 'SP', 'PT');
    const pipeline = new SenatorsPipeline(db);

    await pipeline.execute(true);

    const result = db
      .prepare('SELECT * FROM politicians WHERE role = ?')
      .all('SENATOR') as PoliticianRow[];
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
          UrlFotoParlamentar:
            'http://www.senado.leg.br/senadores/img/fotos-oficiais/senador5672.jpg',
        },
      },
    ];
    const response = createMockResponse(senators);

    nock(API_BASE_URL)
      .get('/dadosabertos/senador/lista/atual')
      .query({ participacao: 'T', v: '4' })
      .reply(200, response);

    politicianRepo.seedTSESenatorByName(5672, 'Alan Rick', 'AC', 'REPUBLICANOS');
    const pipeline = new SenatorsPipeline(db);

    await pipeline.execute(true);

    const result = db
      .prepare('SELECT * FROM politicians WHERE role = ?')
      .all('SENATOR') as PoliticianRow[];
    assert.strictEqual(result.length, 1, 'Should contain 1 senator');
    assert.strictEqual(
      result[0].photo_url,
      'http://www.senado.leg.br/senadores/img/fotos-oficiais/senador5672.jpg',
      'Photo URL should be stored correctly',
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

    politicianRepo.seedTSESenatorRows(5);
    const pipeline = new SenatorsPipeline(db);

    await pipeline.execute(true);

    const result = db
      .prepare('SELECT * FROM politicians WHERE role = ?')
      .all('SENATOR') as PoliticianRow[];
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

    politicianRepo.seedTSESenatorRows(5);
    const pipeline = new SenatorsPipeline(db);

    await pipeline.execute(true);

    const result = db
      .prepare('SELECT * FROM politicians WHERE role = ?')
      .all('SENATOR') as PoliticianRow[];
    assert.strictEqual(result.length, 5, 'Should contain 5 senators after rate limit retry');

    assert.strictEqual(
      scope.pendingMocks().length,
      0,
      'Both endpoint calls (429 and 200) should have been made',
    );
  });

  it('should fail after exhausting all retries', async () => {
    const scope = nock(API_BASE_URL);

    scope
      .get('/dadosabertos/senador/lista/atual')
      .query({ participacao: 'T', v: '4' })
      .times(4)
      .reply(500, 'Internal Server Error');

    const pipeline = new SenatorsPipeline(db);

    await assert.rejects(
      async () => pipeline.execute(),
      (error: unknown) => {
        assert.ok((error as Error).message.includes('500'), 'Error should mention status 500');
        return true;
      },
      'Should throw error after exhausting retries',
    );

    assert.strictEqual(
      scope.pendingMocks().length,
      0,
      'All 4 endpoint calls should have been made',
    );
  });

  it('should handle invalid response format', async () => {
    nock(API_BASE_URL)
      .get('/dadosabertos/senador/lista/atual')
      .query({ participacao: 'T', v: '4' })
      .reply(200, { invalid: 'format' });

    const pipeline = new SenatorsPipeline(db);

    await assert.rejects(
      async () => pipeline.execute(),
      (error: unknown) => {
        assert.ok(
          (error as Error).message.includes('Response does not contain Parlamentar data'),
          'Error should mention invalid response format',
        );
        return true;
      },
      'Should throw error for invalid response format',
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

    const pipeline = new SenatorsPipeline(db);

    await assert.rejects(
      async () => pipeline.execute(),
      (error: unknown) => {
        assert.ok(
          (error as Error).message.includes('Response does not contain Parlamentar data'),
          'Error should mention missing Parlamentar data',
        );
        return true;
      },
      'Should throw error for missing Parlamentar data',
    );
  });

  it('should skip download when senators already exist', async () => {
    politicianRepo.seedTSESenatorRows(3);

    const pipeline = new SenatorsPipeline(db);
    await pipeline.execute(false);

    const result = db
      .prepare('SELECT COUNT(*) as count FROM politicians WHERE role = ?')
      .get('SENATOR') as CountRow;
    assert.strictEqual(result.count, 3, 'Should still contain 3 senators (no re-download)');
  });

  it('should force download when forceDownload flag is true', async () => {
    const senators = Array.from({ length: 5 }, (_, i) => createMockSenator(i + 1));
    const response = createMockResponse(senators);

    nock(API_BASE_URL)
      .get('/dadosabertos/senador/lista/atual')
      .query({ participacao: 'T', v: '4' })
      .reply(200, response);

    politicianRepo.seedTSESenatorRows(5);
    const pipeline = new SenatorsPipeline(db);

    await pipeline.execute(true);

    const result = db
      .prepare('SELECT COUNT(*) as count FROM politicians WHERE role = ?')
      .get('SENATOR') as CountRow;
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
          UrlFotoParlamentar:
            'http://www.senado.leg.br/senadores/img/fotos-oficiais/senador5672.jpg',
        },
      },
    ];
    const response = createMockResponse(senators);

    nock(API_BASE_URL)
      .get('/dadosabertos/senador/lista/atual')
      .query({ participacao: 'T', v: '4' })
      .reply(200, response);

    politicianRepo.seedTSESenatorByName(5672, 'Alan Rick', 'AC', 'REPUBLICANOS');
    const pipeline = new SenatorsPipeline(db);

    await pipeline.execute(true);

    const result = db
      .prepare('SELECT * FROM politicians WHERE role = ?')
      .get('SENATOR') as PoliticianRow;
    assert.strictEqual(result.source_api_id, '5672', 'Source API ID should be mapped correctly');
    assert.strictEqual(result.name, 'Alan Rick', 'Name should be mapped correctly');
    assert.strictEqual(result.uf, 'AC', 'UF should be mapped correctly');
    assert.strictEqual(result.party_id, 'republicanos', 'Party ID should be normalized correctly');
    assert.strictEqual(result.role, 'SENATOR', 'Role should be SENATOR');
    assert.strictEqual(
      result.photo_url,
      'http://www.senado.leg.br/senadores/img/fotos-oficiais/senador5672.jpg',
      'Photo URL should be mapped correctly',
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

    politicianRepo.seedTSESenatorByName(1, 'Senator 1', 'SP', 'PT');
    politicianRepo.seedTSESenatorByName(2, 'Senator 2', 'RJ', 'PT');
    politicianRepo.seedTSESenatorByName(3, 'Senator 3', 'MG', 'PT');
    politicianRepo.seedTSESenatorByName(4, 'Senator 4', 'BA', 'PT');
    const pipeline = new SenatorsPipeline(db);

    await pipeline.execute(true);

    const result = db
      .prepare('SELECT DISTINCT uf FROM politicians WHERE role = ? ORDER BY uf')
      .all('SENATOR') as { uf: string }[];
    assert.strictEqual(result.length, 4, 'Should have senators from 4 different states');
    assert.strictEqual(result[0].uf, 'BA', 'Should have senator from BA');
    assert.strictEqual(result[1].uf, 'MG', 'Should have senator from MG');
    assert.strictEqual(result[2].uf, 'RJ', 'Should have senator from RJ');
    assert.strictEqual(result[3].uf, 'SP', 'Should have senator from SP');

    assert.ok(nock.isDone(), 'All HTTP mocks should be called');
  });
});
