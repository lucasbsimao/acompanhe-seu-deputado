// SPDX-License-Identifier: AGPL-3.0-or-later

import * as assert from 'node:assert';
import { describe, it, beforeEach, afterEach } from 'node:test';
import nock from 'nock';
import { CeapsExpensesPipeline } from '../../../src/pipelines/dados-abertos-senado/CeapsExpensesPipeline';
import { useTestDatabase } from '../../db/setup';
import { TestPoliticianRepository, makeCPF } from '../../db/TestPoliticianRepository';
import { TestExpensesRepository } from '../../db/TestExpensesRepository';
import { CodTipoDocumento } from '../../../src/types/CodTipoDocumento';
import defaultConfig from '../../../src/config/defaults.json';

const API_BASE_URL = 'https://adm.senado.gov.br';

interface ExpenseRow {
  id: string;
  politician_id: string;
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
  competency_year: number;
  competency_month: number;
}

describe('CeapsExpensesPipeline Integration Tests', () => {
  const { getDb } = useTestDatabase();

  let db: ReturnType<typeof getDb>['db'];
  let politicianRepo: TestPoliticianRepository;
  let expensesRepo: TestExpensesRepository;

  beforeEach(() => {
    db = getDb().db;
    politicianRepo = new TestPoliticianRepository(db);
    expensesRepo = new TestExpensesRepository(db);
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

    const yearsToFetch = defaultConfig.senateExpenses.yearsToFetch;

    nock(API_BASE_URL)
      .get(`/adm-dadosabertos/api/v1/senadores/despesas_ceaps/${year}`)
      .reply(200, { despesasCeaps: mockExpenses });

    // Mock other years to return empty so they don't fail the test
    for (let i = 1; i < yearsToFetch; i++) {
      nock(API_BASE_URL)
        .get(`/adm-dadosabertos/api/v1/senadores/despesas_ceaps/${year - i}`)
        .reply(200, { despesasCeaps: [] });
    }

    const pipeline = new CeapsExpensesPipeline(db);
    await pipeline.execute(true);

    const result = expensesRepo.getAllExpenses() as ExpenseRow[];
    assert.strictEqual(result.length, 2);

    assert.strictEqual(result[0].id, '101');
    assert.strictEqual(result[0].politician_id, senatorCpf);
    assert.strictEqual(result[0].tipo_despesa, 'ALUGUEL DE IMOVEIS E DESPESAS CONDOMINIAIS');
    assert.strictEqual(result[0].cod_tipo_documento, CodTipoDocumento.NOTA_FISCAL);
    assert.strictEqual(result[0].valor_liquido, 150050);
    assert.strictEqual(result[0].cnpj_cpf_fornecedor, '12345678000190');
    assert.strictEqual(result[0].competency_year, year);
    assert.strictEqual(result[0].competency_month, 5);

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

    const yearsToFetch = defaultConfig.senateExpenses.yearsToFetch;

    nock(API_BASE_URL)
      .get(`/adm-dadosabertos/api/v1/senadores/despesas_ceaps/${year}`)
      .reply(200, { despesasCeaps: mockExpenses });

    // Mock other years
    for (let i = 1; i < yearsToFetch; i++) {
      nock(API_BASE_URL)
        .get(`/adm-dadosabertos/api/v1/senadores/despesas_ceaps/${year - i}`)
        .reply(200, { despesasCeaps: [] });
    }

    const pipeline = new CeapsExpensesPipeline(db);
    await pipeline.execute(true);

    const result = expensesRepo.getAllExpenses();

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
    expensesRepo.seedExpense({
      id: '999',
      politicianId: senatorCpf,
      tipoDespesa: 'TEST',
      dataDocumento: `${year}-01-01`,
      numDocumento: 'DOC',
      cnpj: '000',
    });

    const yearsToFetch = defaultConfig.senateExpenses.yearsToFetch;

    // We don't setup nock for this year, so if it tries to fetch, it will fail
    // But we mock the other years
    for (let i = 1; i < yearsToFetch; i++) {
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

    const yearsToFetch = defaultConfig.senateExpenses.yearsToFetch;

    nock(API_BASE_URL)
      .get(`/adm-dadosabertos/api/v1/senadores/despesas_ceaps/${year}`)
      .reply(200, { despesasCeaps: mockExpenses });

    for (let i = 1; i < yearsToFetch; i++) {
      nock(API_BASE_URL)
        .get(`/adm-dadosabertos/api/v1/senadores/despesas_ceaps/${year - i}`)
        .reply(200, { despesasCeaps: [] });
    }

    const pipeline = new CeapsExpensesPipeline(db);
    await pipeline.execute(true);

    const count = expensesRepo.countExpenses();
    assert.strictEqual(count, 0);
  });

  it('should fail the entire pipeline if one year fails', async () => {
    const year = new Date().getFullYear();

    // Use a more robust nock that matches any year but returns 404 for the target year
    nock(API_BASE_URL)
      .persist()
      .get(uri => uri.includes('/despesas_ceaps/'))
      .reply(uri => {
        if (uri.endsWith(`/${year}`)) {
          return [404, 'Not Found'];
        }
        return [200, { despesasCeaps: [] }];
      });

    const pipeline = new CeapsExpensesPipeline(db);
    await assert.rejects(pipeline.execute(true), /Failed to fetch CEAPS expenses for year/);
    nock.cleanAll();
  });

  it('should handle multiple years with data in parallel', async () => {
    const year = new Date().getFullYear();
    const senatorCode = '5672';
    const senatorCpf = makeCPF(1);
    politicianRepo.seedSenator(senatorCpf, { sourceApiId: senatorCode });

    nock(API_BASE_URL)
      .get(`/adm-dadosabertos/api/v1/senadores/despesas_ceaps/${year}`)
      .reply(200, { despesasCeaps: [createMockExpense(401, Number(senatorCode), year)] });

    nock(API_BASE_URL)
      .get(`/adm-dadosabertos/api/v1/senadores/despesas_ceaps/${year - 1}`)
      .reply(200, { despesasCeaps: [createMockExpense(402, Number(senatorCode), year - 1)] });

    // Mock others as empty
    const yearsToFetch = defaultConfig.senateExpenses.yearsToFetch;
    for (let i = 2; i < yearsToFetch; i++) {
      nock(API_BASE_URL)
        .get(`/adm-dadosabertos/api/v1/senadores/despesas_ceaps/${year - i}`)
        .reply(200, { despesasCeaps: [] });
    }

    const pipeline = new CeapsExpensesPipeline(db);
    await pipeline.execute(true);

    const count = expensesRepo.countExpenses();
    assert.strictEqual(count, 2);
    assert.ok(nock.isDone());
  });
});
