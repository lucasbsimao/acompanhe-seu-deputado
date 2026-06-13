// SPDX-License-Identifier: AGPL-3.0-or-later

import * as assert from 'node:assert';
import { describe, it, beforeEach, afterEach } from 'node:test';
import nock from 'nock';
import { CeapsExpensesPipeline } from '../../src/pipelines/dados-abertos-senado/CeapsExpensesPipeline';
import { useTestDatabase } from '../db/setup';
import { TestPoliticianRepository, makeCPF } from '../db/TestPoliticianRepository';
import { CodTipoDocumento } from '../../src/types/CodTipoDocumento';

const API_BASE_URL = 'https://adm.senado.gov.br';

interface ExpenseRow {
  id: string;
  deputy_id: string;
  tipo_despesa: string;
  cod_documento: string;
  cod_tipo_documento: number;
  data_documento: string;
  num_documento: string;
  url_documento: string | null;
  nome_fornecedor: string;
  cnpj_cpf_fornecedor: string;
  valor_liquido: number;
  valor_glosa: number;
}

describe('CeapsExpensesPipeline Integration Tests', () => {
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

  function createMockExpense(id: number, codSenador: number, year: number) {
    return {
      id,
      codSenador,
      tipoDespesa: 'ALUGUEL DE IMÓVEIS E DESPESAS CONDOMINIAIS',
      tipoDocumento: 'Nota Fiscal',
      data: `${year}-05-15`,
      documento: `DOC-${id}`,
      fornecedor: `Fornecedor ${id}`,
      cpfCnpj: '12.345.678/0001-90',
      valorReembolsado: 1500.5,
    };
  }

  it('should fetch and persist CEAPS expenses', async () => {
    const year = new Date().getFullYear();
    const senatorCode = '5672';
    const senatorCpf = makeCPF(1);

    // Seed senator with source_api_id so lookup works
    politicianRepo.seedSenator(senatorCpf, { sourceApiId: senatorCode });

    const mockExpenses = [
      createMockExpense(101, Number(senatorCode), year),
      createMockExpense(102, Number(senatorCode), year),
    ];

    nock(API_BASE_URL)
      .get(`/adm-dadosabertos/api/v1/senadores/despesas_ceaps/${year}`)
      .reply(200, { despesasCeaps: mockExpenses });

    // Mock other years to return empty so they don't fail the test
    for (let i = 1; i < 4; i++) {
      nock(API_BASE_URL)
        .get(`/adm-dadosabertos/api/v1/senadores/despesas_ceaps/${year - i}`)
        .reply(200, { despesasCeaps: [] });
    }

    const pipeline = new CeapsExpensesPipeline(db);
    await pipeline.execute(true);

    const result = db.prepare('SELECT * FROM expenses ORDER BY id').all() as ExpenseRow[];
    assert.strictEqual(result.length, 2);

    assert.strictEqual(result[0].id, '101');
    assert.strictEqual(result[0].deputy_id, senatorCpf);
    assert.strictEqual(result[0].tipo_despesa, 'ALUGUEL DE IMOVEIS E DESPESAS CONDOMINIAIS');
    assert.strictEqual(result[0].cod_tipo_documento, CodTipoDocumento.NOTA_FISCAL);
    assert.strictEqual(result[0].valor_liquido, 150050);
    assert.strictEqual(result[0].cnpj_cpf_fornecedor, '12345678000190');

    assert.ok(nock.isDone());
  });

  it('should map different document types correctly', async () => {
    const year = new Date().getFullYear();
    const senatorCode = '5672';
    const senatorCpf = makeCPF(1);
    politicianRepo.seedSenator(senatorCpf, { sourceApiId: senatorCode });

    const mockExpenses = [
      {
        ...createMockExpense(201, Number(senatorCode), year),
        tipoDocumento: 'Nota Fiscal Eletrônica',
      },
      {
        ...createMockExpense(202, Number(senatorCode), year),
        tipoDocumento: 'Fatura',
      },
      {
        ...createMockExpense(203, Number(senatorCode), year),
        tipoDocumento: 'Passagem / Bilhete / Código Localizador',
      },
      {
        ...createMockExpense(204, Number(senatorCode), year),
        tipoDocumento: 'Unknown Type',
      },
    ];

    nock(API_BASE_URL)
      .get(`/adm-dadosabertos/api/v1/senadores/despesas_ceaps/${year}`)
      .reply(200, { despesasCeaps: mockExpenses });

    // Mock other years
    for (let i = 1; i < 4; i++) {
      nock(API_BASE_URL)
        .get(`/adm-dadosabertos/api/v1/senadores/despesas_ceaps/${year - i}`)
        .reply(200, { despesasCeaps: [] });
    }

    const pipeline = new CeapsExpensesPipeline(db);
    await pipeline.execute(true);

    const result = db
      .prepare('SELECT id, cod_tipo_documento FROM expenses ORDER BY id')
      .all() as any[];

    const types = new Map(result.map(r => [r.id, r.cod_tipo_documento]));
    assert.strictEqual(types.get('201'), CodTipoDocumento.NOTA_FISCAL_ELETRONICA);
    assert.strictEqual(types.get('202'), CodTipoDocumento.FATURA);
    assert.strictEqual(types.get('203'), CodTipoDocumento.PASSAGEM);
    assert.strictEqual(types.get('204'), CodTipoDocumento.OTHER);
  });

  it('should skip download when expenses already exist for a year', async () => {
    const year = new Date().getFullYear();
    const senatorCpf = makeCPF(1);

    // Seed an expense for this year
    politicianRepo.seedSenator(senatorCpf, { sourceApiId: '5672' });
    db.prepare(
      `
      INSERT INTO expenses (id, deputy_id, tipo_despesa, cod_documento, cod_tipo_documento, data_documento, num_documento, nome_fornecedor, cnpj_cpf_fornecedor, valor_liquido, valor_glosa)
      VALUES ('999', ?, 'TEST', '999', 0, ?, 'DOC', 'F', '000', 100, 0)
    `,
    ).run(senatorCpf, `${year}-01-01`);

    // We don't setup nock for this year, so if it tries to fetch, it will fail
    // But we mock the other 3 years
    for (let i = 1; i < 4; i++) {
      nock(API_BASE_URL)
        .get(`/adm-dadosabertos/api/v1/senadores/despesas_ceaps/${year - i}`)
        .reply(200, { despesasCeaps: [] });
    }

    const pipeline = new CeapsExpensesPipeline(db);
    await pipeline.execute(false); // forceDownload = false

    assert.ok(nock.isDone());
  });

  it('should warn and skip when senator code is unknown', async () => {
    const year = new Date().getFullYear();
    const mockExpenses = [
      createMockExpense(301, 9999, year), // Unknown senator code
    ];

    nock(API_BASE_URL)
      .get(`/adm-dadosabertos/api/v1/senadores/despesas_ceaps/${year}`)
      .reply(200, { despesasCeaps: mockExpenses });

    for (let i = 1; i < 4; i++) {
      nock(API_BASE_URL)
        .get(`/adm-dadosabertos/api/v1/senadores/despesas_ceaps/${year - i}`)
        .reply(200, { despesasCeaps: [] });
    }

    const pipeline = new CeapsExpensesPipeline(db);
    await pipeline.execute(true);

    const count = (db.prepare('SELECT COUNT(*) as count FROM expenses').get() as any).count;
    assert.strictEqual(count, 0);
  });
});
