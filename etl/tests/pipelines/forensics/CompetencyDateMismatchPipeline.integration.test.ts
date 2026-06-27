// SPDX-License-Identifier: AGPL-3.0-or-later

import * as assert from 'node:assert';
import { describe, it, beforeEach } from 'node:test';
import { CompetencyDateMismatchPipeline } from '../../../src/pipelines/forensics/CompetencyDateMismatchPipeline';
import { ForensicFlag } from '../../../src/pipelines/forensics/ForensicFlag';
import { useTestDatabase } from '../../db/setup';
import { TestPoliticianRepository } from '../../db/TestPoliticianRepository';
import { TestExpensesRepository } from '../../db/TestExpensesRepository';
import { TestForensicFlagsRepository } from '../../db/TestForensicFlagsRepository';

describe('CompetencyDateMismatchPipeline Integration Tests', () => {
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

  it('flags expense when document date is more than 90 days before competency period', async () => {
    politicianRepo.seedDeputy('CPF001');
    // Competency: 2024-04-01. 90 days before is 2024-01-02.
    // So 2024-01-01 is 91 days before.
    expensesRepo.seedExpense({
      id: 'EXP-1',
      politicianId: 'CPF001',
      cnpj: '11222333000181',
      dataDocumento: '2024-01-01',
      competencyYear: 2024,
      competencyMonth: 4,
    });

    const pipeline = new CompetencyDateMismatchPipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepo.getAllFlags();
    assert.strictEqual(flags.length, 1);
    assert.strictEqual(flags[0].entity_id, 'EXP-1');
    assert.strictEqual(flags[0].flag_name, ForensicFlag.COMPETENCY_DATE_MISMATCH);
    assert.strictEqual(flags[0].score, 20);

    const metadata = JSON.parse(flags[0].metadata!);
    assert.strictEqual(metadata.competency_year, 2024);
    assert.strictEqual(metadata.competency_month, 4);
    assert.strictEqual(metadata.data_documento, '2024-01-01');
  });

  it('does not flag when document date is exactly 90 days before competency period', async () => {
    politicianRepo.seedDeputy('CPF001');
    // Competency: 2024-04-01. 90 days before is 2024-01-02.
    expensesRepo.seedExpense({
      id: 'EXP-2',
      politicianId: 'CPF001',
      cnpj: '11222333000181',
      dataDocumento: '2024-01-02',
      competencyYear: 2024,
      competencyMonth: 4,
    });

    const pipeline = new CompetencyDateMismatchPipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepo.getAllFlags();
    assert.strictEqual(flags.length, 0);
  });

  it('does not flag when document date is less than 90 days before competency period', async () => {
    politicianRepo.seedDeputy('CPF001');
    expensesRepo.seedExpense({
      id: 'EXP-3',
      politicianId: 'CPF001',
      cnpj: '11222333000181',
      dataDocumento: '2024-03-01',
      competencyYear: 2024,
      competencyMonth: 4,
    });

    const pipeline = new CompetencyDateMismatchPipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepo.getAllFlags();
    assert.strictEqual(flags.length, 0);
  });

  it('does not flag when competency_year or competency_month is NULL', async () => {
    politicianRepo.seedDeputy('CPF001');
    expensesRepo.seedExpense({
      id: 'EXP-4',
      politicianId: 'CPF001',
      cnpj: '11222333000181',
      dataDocumento: '2024-01-01',
      competencyYear: undefined, // Will be seeded as NULL
      competencyMonth: 4,
    });
    expensesRepo.seedExpense({
      id: 'EXP-5',
      politicianId: 'CPF001',
      cnpj: '11222333000181',
      dataDocumento: '2024-01-01',
      competencyYear: 2024,
      competencyMonth: undefined, // Will be seeded as NULL
    });

    const pipeline = new CompetencyDateMismatchPipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepo.getAllFlags();
    assert.strictEqual(flags.length, 0);
  });

  it('is idempotent on double execute', async () => {
    politicianRepo.seedDeputy('CPF001');
    expensesRepo.seedExpense({
      id: 'EXP-6',
      politicianId: 'CPF001',
      cnpj: '11222333000181',
      dataDocumento: '2024-01-01',
      competencyYear: 2024,
      competencyMonth: 4,
    });

    const pipeline = new CompetencyDateMismatchPipeline(db);
    await pipeline.execute();
    await pipeline.execute();

    const flags = forensicFlagsRepo.getAllFlags();
    assert.strictEqual(flags.length, 1);
  });
});
