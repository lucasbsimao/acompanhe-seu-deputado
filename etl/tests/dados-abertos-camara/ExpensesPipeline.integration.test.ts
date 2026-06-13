// SPDX-License-Identifier: AGPL-3.0-or-later

import * as assert from 'node:assert';
import { describe, it, beforeEach, afterEach } from 'node:test';
import nock from 'nock';
import { ExpensesPipeline } from '../../src/pipelines/dados-abertos-camara/ExpensesPipeline';
import { useTestDatabase } from '../db/setup';
import { TestPoliticianRepository } from '../db/TestPoliticianRepository';
import { TestExpensesRepository } from '../db/TestExpensesRepository';

const API_BASE_URL = 'https://dadosabertos.camara.leg.br';
const DEPUTY_API_ID = '12345';
const DEPUTY_CPF = '12345678901';

function createMockExpense(
  codDocumento: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ano: 2026,
    mes: 1,
    tipoDespesa: 'MANUTENÇÃO DE ESCRITÓRIO DE APOIO À ATIVIDADE PARLAMENTAR',
    codDocumento,
    tipoDocumento: 'Nota Fiscal',
    codTipoDocumento: 0,
    dataDocumento: '2026-01-15',
    numDocumento: `NF-${codDocumento}`,
    valorDocumento: 1500.5,
    urlDocumento: `https://example.com/doc/${codDocumento}`,
    nomeFornecedor: 'Fornecedor Teste LTDA',
    cnpjCpfFornecedor: '12.345.678/0001-99',
    valorLiquido: 1500.5,
    valorGlosa: 0,
    numRessarcimento: '',
    codLote: 1,
    parcela: 0,
    ...overrides,
  };
}

function buildExpensesQuery(page: number, yearsToFetch = 4): Record<string, string> {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: yearsToFetch }, (_, i) => currentYear - i).join(',');
  return {
    ordem: 'ASC',
    ano: years,
    ordenarPor: 'ano',
    pagina: String(page),
    itens: '100',
  };
}

interface ExpenseRow {
  id: string;
  politician_id: string;
  tipo_despesa: string;
  cod_documento: string;
  nome_fornecedor: string;
  cnpj_cpf_fornecedor: string;
  valor_liquido: number;
  valor_glosa: number;
  url_documento: string | null;
}

interface CountRow {
  cnt: number;
}

describe('ExpensesPipeline Integration Tests', () => {
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

  it('should fetch and persist expenses data with a single page', async () => {
    politicianRepo.seedDeputy(DEPUTY_CPF, { sourceApiId: DEPUTY_API_ID });

    const expenses = [createMockExpense('DOC001'), createMockExpense('DOC002')];

    nock(API_BASE_URL)
      .get(`/api/v2/deputados/${DEPUTY_API_ID}/despesas`)
      .query(buildExpensesQuery(1))
      .reply(200, { dados: expenses }, { 'x-total-count': '2' });

    const pipeline = new ExpensesPipeline(db);
    await pipeline.execute(true);

    const rows = db.prepare('SELECT * FROM expenses ORDER BY cod_documento').all() as ExpenseRow[];
    assert.strictEqual(rows.length, 2, 'Should contain 2 expense rows');

    assert.strictEqual(rows[0].id, `${DEPUTY_CPF}_DOC001`, 'ID should be cpf_codDocumento');
    assert.strictEqual(rows[0].politician_id, DEPUTY_CPF, 'politician_id should match CPF');
    assert.strictEqual(rows[0].cod_documento, 'DOC001', 'cod_documento should match');
    assert.strictEqual(
      rows[0].nome_fornecedor,
      'Fornecedor Teste LTDA',
      'nome_fornecedor should be set',
    );
    // cnpj_cpf_fornecedor is normalized to digits only
    assert.strictEqual(
      rows[0].cnpj_cpf_fornecedor,
      '12345678000199',
      'cnpj should be numeric only',
    );
    // valor_liquido is stored in cents (1500.50 * 100 = 150050)
    assert.strictEqual(rows[0].valor_liquido, 150050, 'valor_liquido should be in cents');
    assert.strictEqual(rows[0].valor_glosa, 0, 'valor_glosa should be 0 cents');

    assert.ok(nock.isDone(), 'All HTTP mocks should be called');
  });

  it('should normalize tipoDespesa — strip accents and punctuation', async () => {
    politicianRepo.seedDeputy(DEPUTY_CPF, { sourceApiId: DEPUTY_API_ID });

    const expense = createMockExpense('DOC003', {
      tipoDespesa: 'MANUTENÇÃO DE ESCRITÓRIO DE APOIO À ATIVIDADE PARLAMENTAR',
    });

    nock(API_BASE_URL)
      .get(`/api/v2/deputados/${DEPUTY_API_ID}/despesas`)
      .query(buildExpensesQuery(1))
      .reply(200, { dados: [expense] }, { 'x-total-count': '1' });

    const pipeline = new ExpensesPipeline(db);
    await pipeline.execute(true);

    const row = db
      .prepare('SELECT tipo_despesa FROM expenses WHERE cod_documento = ?')
      .get('DOC003') as { tipo_despesa: string } | undefined;
    assert.ok(row, 'Expense row should exist');
    // normalizeLabel strips accents and non-alphanumeric chars (except spaces)
    assert.ok(!row.tipo_despesa.includes('Ã'), 'tipoDespesa should have accents stripped');
    assert.ok(!row.tipo_despesa.includes('Ç'), 'tipoDespesa should have cedilla stripped');
    assert.ok(row.tipo_despesa.length > 0, 'tipoDespesa should not be empty');

    assert.ok(nock.isDone(), 'All HTTP mocks should be called');
  });

  it('should fetch expenses across multiple pages', async () => {
    politicianRepo.seedDeputy(DEPUTY_CPF, { sourceApiId: DEPUTY_API_ID });

    const page1Expenses = Array.from({ length: 100 }, (_, i) =>
      createMockExpense(`DOC${String(i + 1).padStart(4, '0')}`),
    );
    const page2Expenses = Array.from({ length: 50 }, (_, i) =>
      createMockExpense(`DOC${String(i + 101).padStart(4, '0')}`),
    );

    nock(API_BASE_URL)
      .get(`/api/v2/deputados/${DEPUTY_API_ID}/despesas`)
      .query(buildExpensesQuery(1))
      .reply(200, { dados: page1Expenses }, { 'x-total-count': '150' });

    nock(API_BASE_URL)
      .get(`/api/v2/deputados/${DEPUTY_API_ID}/despesas`)
      .query(buildExpensesQuery(2))
      .reply(200, { dados: page2Expenses });

    const pipeline = new ExpensesPipeline(db);
    await pipeline.execute(true);

    const count = (db.prepare('SELECT COUNT(*) as cnt FROM expenses').get() as CountRow).cnt;
    assert.strictEqual(count, 150, 'Should contain 150 expense rows');

    assert.ok(nock.isDone(), 'All HTTP mocks should be called');
  });

  it('should skip download when expenses already exist for the deputy (shouldDownload returns false)', async () => {
    politicianRepo.seedDeputy(DEPUTY_CPF, { sourceApiId: DEPUTY_API_ID });

    // Pre-seed an existing expense so shouldDownload() returns false
    expensesRepo.seedExpense({
      id: `${DEPUTY_CPF}_EXISTING001`,
      politicianId: DEPUTY_CPF,
      cnpj: '12345678000199',
      numDocumento: 'NF-EXISTING',
    });

    // No HTTP mock registered — any network call would fail
    const pipeline = new ExpensesPipeline(db);
    await pipeline.execute(); // forceDownload defaults to false

    const count = (db.prepare('SELECT COUNT(*) as cnt FROM expenses').get() as CountRow).cnt;
    assert.strictEqual(
      count,
      1,
      'Should not have fetched new expenses — still just the pre-seeded one',
    );
    assert.ok(nock.isDone(), 'No HTTP calls should have been made');
  });

  it('should force download even when expenses already exist', async () => {
    politicianRepo.seedDeputy(DEPUTY_CPF, { sourceApiId: DEPUTY_API_ID });

    // Pre-seed an existing expense
    expensesRepo.seedExpense({
      id: `${DEPUTY_CPF}_EXISTING001`,
      politicianId: DEPUTY_CPF,
      cnpj: '12345678000199',
      numDocumento: 'NF-EXISTING',
    });

    const newExpense = createMockExpense('NEW001');

    nock(API_BASE_URL)
      .get(`/api/v2/deputados/${DEPUTY_API_ID}/despesas`)
      .query(buildExpensesQuery(1))
      .reply(200, { dados: [newExpense] }, { 'x-total-count': '1' });

    const pipeline = new ExpensesPipeline(db);
    await pipeline.execute(true); // forceDownload = true

    const count = (db.prepare('SELECT COUNT(*) as cnt FROM expenses').get() as CountRow).cnt;
    assert.strictEqual(
      count,
      2,
      'Should have EXISTING001 + NEW001 (INSERT OR REPLACE keeps both when IDs differ)',
    );

    assert.ok(nock.isDone(), 'All HTTP mocks should be called');
  });

  it('should process multiple deputies and fetch expenses for each', async () => {
    const cpf1 = '11111111101';
    const cpf2 = '22222222202';
    const apiId1 = '11111';
    const apiId2 = '22222';

    politicianRepo.seedDeputy(cpf1, { sourceApiId: apiId1 });
    politicianRepo.seedDeputy(cpf2, { sourceApiId: apiId2 });

    // Deputy 1 expenses
    nock(API_BASE_URL)
      .get(`/api/v2/deputados/${apiId1}/despesas`)
      .query(buildExpensesQuery(1))
      .reply(200, { dados: [createMockExpense('D1DOC001')] }, { 'x-total-count': '1' });

    // Deputy 2 expenses
    nock(API_BASE_URL)
      .get(`/api/v2/deputados/${apiId2}/despesas`)
      .query(buildExpensesQuery(1))
      .reply(200, { dados: [createMockExpense('D2DOC001')] }, { 'x-total-count': '1' });

    const pipeline = new ExpensesPipeline(db);
    await pipeline.execute(true);

    const dep1Count = (
      db
        .prepare('SELECT COUNT(*) as cnt FROM expenses WHERE politician_id = ?')
        .get(cpf1) as CountRow
    ).cnt;
    const dep2Count = (
      db
        .prepare('SELECT COUNT(*) as cnt FROM expenses WHERE politician_id = ?')
        .get(cpf2) as CountRow
    ).cnt;
    assert.strictEqual(dep1Count, 1, 'Deputy 1 should have 1 expense');
    assert.strictEqual(dep2Count, 1, 'Deputy 2 should have 1 expense');

    assert.ok(nock.isDone(), 'All HTTP mocks should be called');
  });

  it('should skip deputies with no source_api_id', async () => {
    // Deputy without source_api_id (NULL)
    politicianRepo.seedDeputy('99999999901', { name: 'Deputy No API ID', sourceApiId: null });

    // No HTTP mock — any call would fail
    const pipeline = new ExpensesPipeline(db);
    await pipeline.execute(true);

    const count = (db.prepare('SELECT COUNT(*) as cnt FROM expenses').get() as CountRow).cnt;
    assert.strictEqual(count, 0, 'No expenses should be fetched for deputy with no API ID');
    assert.ok(nock.isDone(), 'No HTTP calls should have been made');
  });

  it('should retry on 500 errors and eventually succeed', async () => {
    politicianRepo.seedDeputy(DEPUTY_CPF, { sourceApiId: DEPUTY_API_ID });

    // 3 failures then success
    nock(API_BASE_URL)
      .get(`/api/v2/deputados/${DEPUTY_API_ID}/despesas`)
      .query(buildExpensesQuery(1))
      .times(3)
      .reply(500, 'Internal Server Error');

    nock(API_BASE_URL)
      .get(`/api/v2/deputados/${DEPUTY_API_ID}/despesas`)
      .query(buildExpensesQuery(1))
      .reply(200, { dados: [createMockExpense('RETRIED001')] }, { 'x-total-count': '1' });

    const pipeline = new ExpensesPipeline(db);
    await pipeline.execute(true);

    const count = (db.prepare('SELECT COUNT(*) as cnt FROM expenses').get() as CountRow).cnt;
    assert.strictEqual(count, 1, 'Should contain 1 expense after retries');

    assert.ok(nock.isDone(), 'All HTTP mocks should be called');
  });

  it('should throw after exhausting all retries', async () => {
    politicianRepo.seedDeputy(DEPUTY_CPF, { sourceApiId: DEPUTY_API_ID });

    nock(API_BASE_URL)
      .get(`/api/v2/deputados/${DEPUTY_API_ID}/despesas`)
      .query(buildExpensesQuery(1))
      .times(4)
      .reply(500, 'Internal Server Error');

    const pipeline = new ExpensesPipeline(db);

    await assert.rejects(
      async () => pipeline.execute(true),
      (error: unknown) => {
        assert.ok((error as Error).message.includes('500'), 'Error should mention status 500');
        return true;
      },
      'Should throw after exhausting all retries',
    );
  });

  it('should handle missing X-Total-Count header', async () => {
    politicianRepo.seedDeputy(DEPUTY_CPF, { sourceApiId: DEPUTY_API_ID });

    nock(API_BASE_URL)
      .get(`/api/v2/deputados/${DEPUTY_API_ID}/despesas`)
      .query(buildExpensesQuery(1))
      .reply(200, { dados: [] }); // no x-total-count header

    const pipeline = new ExpensesPipeline(db);

    await assert.rejects(
      async () => pipeline.execute(true),
      (error: unknown) => {
        assert.ok(
          (error as Error).message.includes('Missing X-Total-Count header'),
          'Error should mention missing header',
        );
        return true;
      },
      'Should throw on missing X-Total-Count header',
    );
  });

  it('should handle invalid response format', async () => {
    politicianRepo.seedDeputy(DEPUTY_CPF, { sourceApiId: DEPUTY_API_ID });

    nock(API_BASE_URL)
      .get(`/api/v2/deputados/${DEPUTY_API_ID}/despesas`)
      .query(buildExpensesQuery(1))
      .reply(200, { invalid: 'format' }, { 'x-total-count': '1' });

    const pipeline = new ExpensesPipeline(db);

    await assert.rejects(
      async () => pipeline.execute(true),
      (error: unknown) => {
        assert.ok(
          (error as Error).message.includes('Response does not contain dados array'),
          'Error should mention invalid response format',
        );
        return true;
      },
      'Should throw on invalid response format',
    );
  });

  it('should use INSERT OR REPLACE to handle duplicate expense documents', async () => {
    politicianRepo.seedDeputy(DEPUTY_CPF, { sourceApiId: DEPUTY_API_ID });

    const expense = createMockExpense('DOC_DUPE', { nomeFornecedor: 'Original Vendor' });

    nock(API_BASE_URL)
      .get(`/api/v2/deputados/${DEPUTY_API_ID}/despesas`)
      .query(buildExpensesQuery(1))
      .reply(200, { dados: [expense] }, { 'x-total-count': '1' });

    const pipeline = new ExpensesPipeline(db);
    await pipeline.execute(true);

    let row = db
      .prepare('SELECT nome_fornecedor FROM expenses WHERE cod_documento = ?')
      .get('DOC_DUPE') as { nome_fornecedor: string };
    assert.strictEqual(row.nome_fornecedor, 'Original Vendor', 'Initial vendor name should be set');

    // Re-run with updated data
    nock(API_BASE_URL)
      .get(`/api/v2/deputados/${DEPUTY_API_ID}/despesas`)
      .query(buildExpensesQuery(1))
      .reply(
        200,
        { dados: [{ ...expense, nomeFornecedor: 'Updated Vendor' }] },
        { 'x-total-count': '1' },
      );

    const pipeline2 = new ExpensesPipeline(db);
    await pipeline2.execute(true);

    row = db
      .prepare('SELECT nome_fornecedor FROM expenses WHERE cod_documento = ?')
      .get('DOC_DUPE') as { nome_fornecedor: string };
    assert.strictEqual(
      row.nome_fornecedor,
      'Updated Vendor',
      'Vendor name should be updated via INSERT OR REPLACE',
    );

    const count = (db.prepare('SELECT COUNT(*) as cnt FROM expenses').get() as CountRow).cnt;
    assert.strictEqual(count, 1, 'Should still have only 1 expense row after upsert');

    assert.ok(nock.isDone(), 'All HTTP mocks should be called');
  });

  it('should store null urlDocumento when API returns empty string', async () => {
    politicianRepo.seedDeputy(DEPUTY_CPF, { sourceApiId: DEPUTY_API_ID });

    const expense = createMockExpense('DOC_NO_URL', { urlDocumento: '' });

    nock(API_BASE_URL)
      .get(`/api/v2/deputados/${DEPUTY_API_ID}/despesas`)
      .query(buildExpensesQuery(1))
      .reply(200, { dados: [expense] }, { 'x-total-count': '1' });

    const pipeline = new ExpensesPipeline(db);
    await pipeline.execute(true);

    const row = db
      .prepare('SELECT url_documento FROM expenses WHERE cod_documento = ?')
      .get('DOC_NO_URL') as { url_documento: string | null } | undefined;
    assert.ok(row, 'Expense row should exist');
    assert.strictEqual(
      row.url_documento,
      null,
      'url_documento should be null when API returns empty string',
    );

    assert.ok(nock.isDone(), 'All HTTP mocks should be called');
  });
});
