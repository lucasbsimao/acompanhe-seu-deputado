// SPDX-License-Identifier: AGPL-3.0-or-later

import * as assert from 'node:assert';
import { describe, it, beforeEach } from 'node:test';
import { CnpjPostdatesExpensePipeline } from '../../src/pipelines/forensics/CnpjPostdatesExpensePipeline';
import { ForensicFlag } from '../../src/pipelines/forensics/ForensicFlag';
import { useTestDatabase } from '../db/setup';
import { TestPoliticianRepository } from '../db/TestPoliticianRepository';
import { TestExpensesRepository } from '../db/TestExpensesRepository';
import { TestVendorRepository } from '../db/TestVendorRepository';
import { TestForensicFlagsRepository } from '../db/TestForensicFlagsRepository';

describe('CnpjPostdatesExpensePipeline Integration Tests', () => {
  const { getDb } = useTestDatabase();

  let db: ReturnType<typeof getDb>['db'];
  let politicianRepo: TestPoliticianRepository;
  let expensesRepo: TestExpensesRepository;
  let vendorRepo: TestVendorRepository;
  let forensicFlagsRepo: TestForensicFlagsRepository;

  beforeEach(() => {
    db = getDb().db;
    politicianRepo = new TestPoliticianRepository(db);
    expensesRepo = new TestExpensesRepository(db);
    vendorRepo = new TestVendorRepository(db);
    forensicFlagsRepo = new TestForensicFlagsRepository(db);
  });

  it('flags expense when vendor opening_date is strictly after data_documento', async () => {
    politicianRepo.seedDeputy('CPF001');
    expensesRepo.seedExpense({
      id: 'EXP-1',
      politicianId: 'CPF001',
      cnpj: '11222333000181',
      dataDocumento: '2023-06-01',
    });
    vendorRepo.seedVendor('11222333000181', '2023-06-15');

    const pipeline = new CnpjPostdatesExpensePipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepo.getAllFlags();
    assert.strictEqual(flags.length, 1);
    assert.strictEqual(flags[0].entity_id, 'EXP-1');
    assert.strictEqual(flags[0].flag_name, ForensicFlag.CNPJ_POSTDATES_EXPENSE);
    assert.strictEqual(flags[0].score, 50);
    assert.strictEqual(flags[0].source_table, 'expenses');
    assert.strictEqual(flags[0].metadata, null);
  });

  it('does not flag when opening_date equals data_documento', async () => {
    politicianRepo.seedDeputy('CPF001');
    expensesRepo.seedExpense({
      id: 'EXP-2',
      politicianId: 'CPF001',
      cnpj: '11222333000181',
      dataDocumento: '2023-06-15',
    });
    vendorRepo.seedVendor('11222333000181', '2023-06-15');

    const pipeline = new CnpjPostdatesExpensePipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepo.getAllFlags();
    assert.strictEqual(flags.length, 0);
  });

  it('does not flag when opening_date is before data_documento', async () => {
    politicianRepo.seedDeputy('CPF001');
    expensesRepo.seedExpense({
      id: 'EXP-3',
      politicianId: 'CPF001',
      cnpj: '11222333000181',
      dataDocumento: '2023-07-01',
    });
    vendorRepo.seedVendor('11222333000181', '2023-06-15');

    const pipeline = new CnpjPostdatesExpensePipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepo.getAllFlags();
    assert.strictEqual(flags.length, 0);
  });

  it('does not flag when vendor opening_date is NULL', async () => {
    politicianRepo.seedDeputy('CPF001');
    expensesRepo.seedExpense({
      id: 'EXP-4',
      politicianId: 'CPF001',
      cnpj: '11222333000181',
      dataDocumento: '2023-06-01',
    });
    vendorRepo.seedVendor('11222333000181', null);

    const pipeline = new CnpjPostdatesExpensePipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepo.getAllFlags();
    assert.strictEqual(flags.length, 0);
  });

  it('does not flag CPF vendor (length 11)', async () => {
    politicianRepo.seedDeputy('CPF001');
    expensesRepo.seedExpense({
      id: 'EXP-5',
      politicianId: 'CPF001',
      cnpj: '12345678901',
      dataDocumento: '2023-06-01',
    });
    vendorRepo.seedVendor('12345678901', '2023-06-15');

    const pipeline = new CnpjPostdatesExpensePipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepo.getAllFlags();
    assert.strictEqual(flags.length, 0);
  });

  it('does not flag when no matching vendor row exists', async () => {
    politicianRepo.seedDeputy('CPF001');
    expensesRepo.seedExpense({
      id: 'EXP-6',
      politicianId: 'CPF001',
      cnpj: '11222333000181',
      dataDocumento: '2023-06-01',
    });

    const pipeline = new CnpjPostdatesExpensePipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepo.getAllFlags();
    assert.strictEqual(flags.length, 0);
  });

  it('is idempotent — second execute does not duplicate flags', async () => {
    politicianRepo.seedDeputy('CPF001');
    expensesRepo.seedExpense({
      id: 'EXP-7',
      politicianId: 'CPF001',
      cnpj: '11222333000181',
      dataDocumento: '2023-06-01',
    });
    vendorRepo.seedVendor('11222333000181', '2023-06-15');

    const pipeline = new CnpjPostdatesExpensePipeline(db);
    await pipeline.execute();
    await pipeline.execute();

    const flags = forensicFlagsRepo.getAllFlags();
    assert.strictEqual(flags.length, 1);
  });
});
