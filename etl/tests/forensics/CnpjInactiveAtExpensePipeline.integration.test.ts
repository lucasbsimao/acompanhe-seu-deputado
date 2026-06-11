// SPDX-License-Identifier: AGPL-3.0-or-later

import * as assert from 'node:assert';
import { describe, it, beforeEach } from 'node:test';
import { CnpjInactiveAtExpensePipeline } from '../../src/pipelines/forensics/CnpjInactiveAtExpensePipeline';
import { ForensicFlag } from '../../src/pipelines/forensics/ForensicFlag';
import { useTestDatabase } from '../db/setup';
import { TestPoliticianRepository } from '../db/TestPoliticianRepository';
import { TestExpensesRepository } from '../db/TestExpensesRepository';
import { TestVendorRepository } from '../db/TestVendorRepository';
import { TestForensicFlagsRepository } from '../db/TestForensicFlagsRepository';

describe('CnpjInactiveAtExpensePipeline Integration Tests', () => {
  const { getDb } = useTestDatabase();

  let db: ReturnType<typeof getDb>['db'];
  let politicianRepoTest: TestPoliticianRepository;
  let expensesRepoTest: TestExpensesRepository;
  let vendorRepoTest: TestVendorRepository;
  let forensicFlagsRepoTest: TestForensicFlagsRepository;

  beforeEach(() => {
    db = getDb().db;
    politicianRepoTest = new TestPoliticianRepository(db);
    expensesRepoTest = new TestExpensesRepository(db);
    vendorRepoTest = new TestVendorRepository(db);
    forensicFlagsRepoTest = new TestForensicFlagsRepository(db);
  });

  it('flags expense when vendor status is BAIXADA and status_date is before data_documento', async () => {
    politicianRepoTest.seedDeputy('CPF001');
    expensesRepoTest.seedExpense({
      id: 'EXP-1',
      deputyId: 'CPF001',
      cnpj: '11222333000181',
      dataDocumento: '2023-06-15',
    });
    vendorRepoTest.seedVendorWithStatus('11222333000181', 'BAIXADA', '2023-06-01');

    const pipeline = new CnpjInactiveAtExpensePipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepoTest.getAllFlags();
    assert.strictEqual(flags.length, 1);
    assert.strictEqual(flags[0].entity_id, 'EXP-1');
    assert.strictEqual(flags[0].flag_name, ForensicFlag.CNPJ_INACTIVE_AT_EXPENSE);
    assert.strictEqual(flags[0].score, 50);
    assert.strictEqual(flags[0].source_table, 'expenses');
    assert.strictEqual(flags[0].metadata, null);
  });

  it('flags expense when vendor status is INAPTA and status_date is before data_documento', async () => {
    politicianRepoTest.seedDeputy('CPF001');
    expensesRepoTest.seedExpense({
      id: 'EXP-2',
      deputyId: 'CPF001',
      cnpj: '11222333000182',
      dataDocumento: '2023-06-15',
    });
    vendorRepoTest.seedVendorWithStatus('11222333000182', 'INAPTA', '2023-06-01');

    const pipeline = new CnpjInactiveAtExpensePipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepoTest.getAllFlags();
    assert.strictEqual(flags.length, 1);
    assert.strictEqual(flags[0].entity_id, 'EXP-2');
    assert.strictEqual(flags[0].flag_name, ForensicFlag.CNPJ_INACTIVE_AT_EXPENSE);
  });

  it('flags expense when vendor status is SUSPENSA and status_date is before data_documento', async () => {
    politicianRepoTest.seedDeputy('CPF001');
    expensesRepoTest.seedExpense({
      id: 'EXP-3',
      deputyId: 'CPF001',
      cnpj: '11222333000183',
      dataDocumento: '2023-06-15',
    });
    vendorRepoTest.seedVendorWithStatus('11222333000183', 'SUSPENSA', '2023-06-01');

    const pipeline = new CnpjInactiveAtExpensePipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepoTest.getAllFlags();
    assert.strictEqual(flags.length, 1);
    assert.strictEqual(flags[0].entity_id, 'EXP-3');
    assert.strictEqual(flags[0].flag_name, ForensicFlag.CNPJ_INACTIVE_AT_EXPENSE);
  });

  it('flags expense when status_date equals data_documento (boundary condition)', async () => {
    politicianRepoTest.seedDeputy('CPF001');
    expensesRepoTest.seedExpense({
      id: 'EXP-4',
      deputyId: 'CPF001',
      cnpj: '11222333000184',
      dataDocumento: '2023-06-15',
    });
    vendorRepoTest.seedVendorWithStatus('11222333000184', 'BAIXADA', '2023-06-15');

    const pipeline = new CnpjInactiveAtExpensePipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepoTest.getAllFlags();
    assert.strictEqual(flags.length, 1);
    assert.strictEqual(flags[0].entity_id, 'EXP-4');
  });

  it('does not flag when status_date is after data_documento', async () => {
    politicianRepoTest.seedDeputy('CPF001');
    expensesRepoTest.seedExpense({
      id: 'EXP-5',
      deputyId: 'CPF001',
      cnpj: '11222333000185',
      dataDocumento: '2023-06-15',
    });
    vendorRepoTest.seedVendorWithStatus('11222333000185', 'BAIXADA', '2023-06-20');

    const pipeline = new CnpjInactiveAtExpensePipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepoTest.getAllFlags();
    assert.strictEqual(flags.length, 0);
  });

  it('does not flag CPF vendor (length 11)', async () => {
    politicianRepoTest.seedDeputy('CPF001');
    expensesRepoTest.seedExpense({
      id: 'EXP-6',
      deputyId: 'CPF001',
      cnpj: '12345678901',
      dataDocumento: '2023-06-15',
    });
    vendorRepoTest.seedVendorWithStatus('12345678901', 'BAIXADA', '2023-06-01');

    const pipeline = new CnpjInactiveAtExpensePipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepoTest.getAllFlags();
    assert.strictEqual(flags.length, 0);
  });

  it('does not flag when registration_status_date is NULL', async () => {
    politicianRepoTest.seedDeputy('CPF001');
    expensesRepoTest.seedExpense({
      id: 'EXP-7',
      deputyId: 'CPF001',
      cnpj: '11222333000186',
      dataDocumento: '2023-06-15',
    });
    vendorRepoTest.seedVendorWithStatus('11222333000186', 'BAIXADA', null);

    const pipeline = new CnpjInactiveAtExpensePipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepoTest.getAllFlags();
    assert.strictEqual(flags.length, 0);
  });

  it('does not flag when registration_status is NULL', async () => {
    politicianRepoTest.seedDeputy('CPF001');
    expensesRepoTest.seedExpense({
      id: 'EXP-8',
      deputyId: 'CPF001',
      cnpj: '11222333000187',
      dataDocumento: '2023-06-15',
    });
    vendorRepoTest.seedVendorWithStatus('11222333000187', null, '2023-06-01');

    const pipeline = new CnpjInactiveAtExpensePipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepoTest.getAllFlags();
    assert.strictEqual(flags.length, 0);
  });

  it('does not flag when registration_status is not an inactive status', async () => {
    politicianRepoTest.seedDeputy('CPF001');
    expensesRepoTest.seedExpense({
      id: 'EXP-9',
      deputyId: 'CPF001',
      cnpj: '11222333000188',
      dataDocumento: '2023-06-15',
    });
    vendorRepoTest.seedVendorWithStatus('11222333000188', 'ATIVA', '2023-06-01');

    const pipeline = new CnpjInactiveAtExpensePipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepoTest.getAllFlags();
    assert.strictEqual(flags.length, 0);
  });

  it('is idempotent — second execute does not duplicate flags', async () => {
    politicianRepoTest.seedDeputy('CPF001');
    expensesRepoTest.seedExpense({
      id: 'EXP-10',
      deputyId: 'CPF001',
      cnpj: '11222333000189',
      dataDocumento: '2023-06-15',
    });
    vendorRepoTest.seedVendorWithStatus('11222333000189', 'BAIXADA', '2023-06-01');

    const pipeline = new CnpjInactiveAtExpensePipeline(db);
    await pipeline.execute();
    await pipeline.execute();

    const flags = forensicFlagsRepoTest.getAllFlags();
    assert.strictEqual(flags.length, 1);
    assert.strictEqual(flags[0].entity_id, 'EXP-10');
  });
});
