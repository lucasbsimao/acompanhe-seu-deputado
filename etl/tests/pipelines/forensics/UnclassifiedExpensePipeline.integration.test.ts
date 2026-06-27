// SPDX-License-Identifier: AGPL-3.0-or-later

import * as assert from 'node:assert';
import { describe, it, beforeEach } from 'node:test';
import { UnclassifiedExpensePipeline } from '../../../src/pipelines/forensics/UnclassifiedExpensePipeline';
import { ForensicFlag } from '../../../src/pipelines/forensics/ForensicFlag';
import { useTestDatabase } from '../../db/setup';
import { TestPoliticianRepository } from '../../db/TestPoliticianRepository';
import { TestExpensesRepository } from '../../db/TestExpensesRepository';
import { TestForensicFlagsRepository } from '../../db/TestForensicFlagsRepository';

describe('UnclassifiedExpensePipeline Integration Tests', () => {
  const { getDb } = useTestDatabase();

  let db: ReturnType<typeof getDb>['db'];
  let politicianRepo: TestPoliticianRepository;
  let expensesRepo: TestExpensesRepository;
  let forensicFlagsRepo: TestForensicFlagsRepository;

  beforeEach(() => {
    db = getDb().db;
    politicianRepo = new TestPoliticianRepository(db);
    expensesRepo = new TestExpensesRepository(db);
    forensicFlagsRepo = new TestForensicFlagsRepository(db);
  });

  it('flags senator expense when tipo_despesa is empty string', async () => {
    politicianRepo.seedSenator('CPF001');
    expensesRepo.seedExpense({
      id: 'EXP-1',
      politicianId: 'CPF001',
      cnpj: '11222333000181',
      tipoDespesa: '',
    });

    const pipeline = new UnclassifiedExpensePipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepo.getAllFlags();
    assert.strictEqual(flags.length, 1);
    assert.strictEqual(flags[0].entity_id, 'EXP-1');
    assert.strictEqual(flags[0].flag_name, ForensicFlag.UNCLASSIFIED_EXPENSE);
    assert.strictEqual(flags[0].score, 35);
  });

  it('flags senator expense when tipo_despesa is NULL', async () => {
    politicianRepo.seedSenator('CPF002');
    // seedExpense defaults to 'MANUTENCAO', so we must bypass it for NULL
    db.prepare(
      `INSERT INTO expenses (id, politician_id, tipo_despesa, cod_documento, cod_tipo_documento,
        data_documento, num_documento, url_documento, nome_fornecedor, cnpj_cpf_fornecedor,
        valor_liquido, valor_glosa)
       VALUES ('EXP-2', 'CPF002', NULL, 'EXP-2', 0, '2024-01-01', 'NF-1', NULL, 'Vendor', '11222333000181', 10000, 0)`,
    ).run();

    const pipeline = new UnclassifiedExpensePipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepo.getAllFlags();
    assert.strictEqual(flags.length, 1);
    assert.strictEqual(flags[0].entity_id, 'EXP-2');
  });

  it('does not flag senator expense when tipo_despesa is present', async () => {
    politicianRepo.seedSenator('CPF003');
    expensesRepo.seedExpense({
      id: 'EXP-3',
      politicianId: 'CPF003',
      cnpj: '11222333000181',
      tipoDespesa: 'COMBUSTIVEL',
    });

    const pipeline = new UnclassifiedExpensePipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepo.getAllFlags();
    assert.strictEqual(flags.length, 0);
  });

  it('does not flag deputy expense even if tipo_despesa is empty', async () => {
    politicianRepo.seedDeputy('CPF004');
    expensesRepo.seedExpense({
      id: 'EXP-4',
      politicianId: 'CPF004',
      cnpj: '11222333000181',
      tipoDespesa: '',
    });

    const pipeline = new UnclassifiedExpensePipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepo.getAllFlags();
    assert.strictEqual(flags.length, 0);
  });

  it('is idempotent on double execute', async () => {
    politicianRepo.seedSenator('CPF005');
    expensesRepo.seedExpense({
      id: 'EXP-5',
      politicianId: 'CPF005',
      cnpj: '11222333000181',
      tipoDespesa: '',
    });

    const pipeline = new UnclassifiedExpensePipeline(db);
    await pipeline.execute();
    await pipeline.execute();

    const flags = forensicFlagsRepo.getAllFlags();
    assert.strictEqual(flags.length, 1);
  });
});
