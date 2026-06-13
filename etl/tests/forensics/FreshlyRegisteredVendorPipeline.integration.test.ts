// SPDX-License-Identifier: AGPL-3.0-or-later

import * as assert from 'node:assert';
import { describe, it, beforeEach } from 'node:test';
import { FreshlyRegisteredVendorPipeline } from '../../src/pipelines/forensics/FreshlyRegisteredVendorPipeline';
import { ForensicFlag } from '../../src/pipelines/forensics/ForensicFlag';
import { useTestDatabase } from '../db/setup';
import { TestPoliticianRepository } from '../db/TestPoliticianRepository';
import { TestExpensesRepository } from '../db/TestExpensesRepository';
import { TestVendorRepository } from '../db/TestVendorRepository';
import { TestForensicFlagsRepository } from '../db/TestForensicFlagsRepository';

describe('FreshlyRegisteredVendorPipeline Integration Tests', () => {
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

  it('flags same-day opening with score 50 and range 0-7', async () => {
    politicianRepo.seedDeputy('CPF001');
    expensesRepo.seedExpense({
      id: 'EXP-1',
      politicianId: 'CPF001',
      cnpj: '11222333000181',
      dataDocumento: '2023-06-01',
    });
    vendorRepo.seedVendor('11222333000181', '2023-06-01');

    const pipeline = new FreshlyRegisteredVendorPipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepo.getAllFlags();
    assert.strictEqual(flags.length, 1);
    assert.strictEqual(flags[0].entity_id, 'EXP-1');
    assert.strictEqual(flags[0].flag_name, ForensicFlag.FRESHLY_REGISTERED_VENDOR);
    assert.strictEqual(flags[0].score, 50);
    const metadata = JSON.parse(flags[0].metadata!);
    assert.strictEqual(metadata.gap_days, 0);
    assert.strictEqual(metadata.range, '0-7');
  });

  it('flags 7-day boundary with score 50 and range 0-7', async () => {
    politicianRepo.seedDeputy('CPF001');
    expensesRepo.seedExpense({
      id: 'EXP-1',
      politicianId: 'CPF001',
      cnpj: '11222333000181',
      dataDocumento: '2023-06-08',
    });
    vendorRepo.seedVendor('11222333000181', '2023-06-01');

    const pipeline = new FreshlyRegisteredVendorPipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepo.getAllFlags();
    assert.strictEqual(flags.length, 1);
    assert.strictEqual(flags[0].score, 50);
    const metadata = JSON.parse(flags[0].metadata!);
    assert.strictEqual(metadata.gap_days, 7);
    assert.strictEqual(metadata.range, '0-7');
  });

  it('flags 8-day boundary with score 25 and range 8-30', async () => {
    politicianRepo.seedDeputy('CPF001');
    expensesRepo.seedExpense({
      id: 'EXP-1',
      politicianId: 'CPF001',
      cnpj: '11222333000181',
      dataDocumento: '2023-06-09',
    });
    vendorRepo.seedVendor('11222333000181', '2023-06-01');

    const pipeline = new FreshlyRegisteredVendorPipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepo.getAllFlags();
    assert.strictEqual(flags.length, 1);
    assert.strictEqual(flags[0].score, 25);
    const metadata = JSON.parse(flags[0].metadata!);
    assert.strictEqual(metadata.gap_days, 8);
    assert.strictEqual(metadata.range, '8-30');
  });

  it('flags 30-day boundary with score 25 and range 8-30', async () => {
    politicianRepo.seedDeputy('CPF001');
    expensesRepo.seedExpense({
      id: 'EXP-1',
      politicianId: 'CPF001',
      cnpj: '11222333000181',
      dataDocumento: '2023-07-01',
    });
    vendorRepo.seedVendor('11222333000181', '2023-06-01');

    const pipeline = new FreshlyRegisteredVendorPipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepo.getAllFlags();
    assert.strictEqual(flags.length, 1);
    assert.strictEqual(flags[0].score, 25);
    const metadata = JSON.parse(flags[0].metadata!);
    assert.strictEqual(metadata.gap_days, 30);
    assert.strictEqual(metadata.range, '8-30');
  });

  it('flags 31-day boundary with score 25 and range 31-90', async () => {
    politicianRepo.seedDeputy('CPF001');
    expensesRepo.seedExpense({
      id: 'EXP-1',
      politicianId: 'CPF001',
      cnpj: '11222333000181',
      dataDocumento: '2023-07-02',
    });
    vendorRepo.seedVendor('11222333000181', '2023-06-01');

    const pipeline = new FreshlyRegisteredVendorPipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepo.getAllFlags();
    assert.strictEqual(flags.length, 1);
    assert.strictEqual(flags[0].score, 25);
    const metadata = JSON.parse(flags[0].metadata!);
    assert.strictEqual(metadata.gap_days, 31);
    assert.strictEqual(metadata.range, '31-90');
  });

  it('flags 89-day boundary with score 25 and range 31-90', async () => {
    politicianRepo.seedDeputy('CPF001');
    expensesRepo.seedExpense({
      id: 'EXP-1',
      politicianId: 'CPF001',
      cnpj: '11222333000181',
      dataDocumento: '2023-08-29',
    });
    vendorRepo.seedVendor('11222333000181', '2023-06-01');

    const pipeline = new FreshlyRegisteredVendorPipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepo.getAllFlags();
    assert.strictEqual(flags.length, 1);
    assert.strictEqual(flags[0].score, 25);
    const metadata = JSON.parse(flags[0].metadata!);
    assert.strictEqual(metadata.gap_days, 89);
    assert.strictEqual(metadata.range, '31-90');
  });

  it('does not flag when gap is exactly 90 days', async () => {
    politicianRepo.seedDeputy('CPF001');
    expensesRepo.seedExpense({
      id: 'EXP-1',
      politicianId: 'CPF001',
      cnpj: '11222333000181',
      dataDocumento: '2023-08-30',
    });
    vendorRepo.seedVendor('11222333000181', '2023-06-01');

    const pipeline = new FreshlyRegisteredVendorPipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepo.getAllFlags();
    assert.strictEqual(flags.length, 0);
  });

  it('does not flag CPF vendor (length 11)', async () => {
    politicianRepo.seedDeputy('CPF001');
    expensesRepo.seedExpense({
      id: 'EXP-1',
      politicianId: 'CPF001',
      cnpj: '12345678901',
      dataDocumento: '2023-06-01',
    });
    vendorRepo.seedVendor('12345678901', '2023-06-01');

    const pipeline = new FreshlyRegisteredVendorPipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepo.getAllFlags();
    assert.strictEqual(flags.length, 0);
  });

  it('does not flag when vendor opening_date is NULL', async () => {
    politicianRepo.seedDeputy('CPF001');
    expensesRepo.seedExpense({
      id: 'EXP-1',
      politicianId: 'CPF001',
      cnpj: '11222333000181',
      dataDocumento: '2023-06-01',
    });
    vendorRepo.seedVendor('11222333000181', null);

    const pipeline = new FreshlyRegisteredVendorPipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepo.getAllFlags();
    assert.strictEqual(flags.length, 0);
  });

  it('does not flag when opening_date postdates first expense (negative gap)', async () => {
    politicianRepo.seedDeputy('CPF001');
    expensesRepo.seedExpense({
      id: 'EXP-1',
      politicianId: 'CPF001',
      cnpj: '11222333000181',
      dataDocumento: '2023-06-01',
    });
    vendorRepo.seedVendor('11222333000181', '2023-06-15');

    const pipeline = new FreshlyRegisteredVendorPipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepo.getAllFlags();
    assert.strictEqual(flags.length, 0);
  });

  it('flags multiple expenses for same vendor', async () => {
    politicianRepo.seedDeputy('CPF001');
    politicianRepo.seedDeputy('CPF002');
    expensesRepo.seedExpense({
      id: 'EXP-1',
      politicianId: 'CPF001',
      cnpj: '11222333000181',
      dataDocumento: '2023-06-15',
    });
    expensesRepo.seedExpense({
      id: 'EXP-2',
      politicianId: 'CPF002',
      cnpj: '11222333000181',
      dataDocumento: '2023-06-20',
    });
    vendorRepo.seedVendor('11222333000181', '2023-06-01');

    const pipeline = new FreshlyRegisteredVendorPipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepo.getAllFlags();
    assert.strictEqual(flags.length, 2);
    assert.ok(flags.every(f => f.flag_name === ForensicFlag.FRESHLY_REGISTERED_VENDOR));
    assert.ok(flags.every(f => f.score === 25));
    const metadata1 = JSON.parse(flags[0].metadata!);
    const metadata2 = JSON.parse(flags[1].metadata!);
    assert.strictEqual(metadata1.gap_days, 14);
    assert.strictEqual(metadata2.gap_days, 14);
  });

  it('uses cross-deputy MIN expense date for gap calculation', async () => {
    politicianRepo.seedDeputy('CPF001');
    politicianRepo.seedDeputy('CPF002');
    expensesRepo.seedExpense({
      id: 'EXP-1',
      politicianId: 'CPF001',
      cnpj: '11222333000181',
      dataDocumento: '2023-06-15',
    });
    expensesRepo.seedExpense({
      id: 'EXP-2',
      politicianId: 'CPF002',
      cnpj: '11222333000181',
      dataDocumento: '2023-06-05',
    });
    vendorRepo.seedVendor('11222333000181', '2023-06-01');

    const pipeline = new FreshlyRegisteredVendorPipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepo.getAllFlags();
    assert.strictEqual(flags.length, 2);
    assert.ok(flags.every(f => f.score === 50));
    assert.ok(
      flags.every(f => {
        const meta = JSON.parse(f.metadata!);
        return meta.gap_days === 4 && meta.range === '0-7';
      }),
    );
  });

  it('is idempotent — second execute does not duplicate flags', async () => {
    politicianRepo.seedDeputy('CPF001');
    expensesRepo.seedExpense({
      id: 'EXP-1',
      politicianId: 'CPF001',
      cnpj: '11222333000181',
      dataDocumento: '2023-06-04',
    });
    vendorRepo.seedVendor('11222333000181', '2023-06-01');

    const pipeline = new FreshlyRegisteredVendorPipeline(db);
    await pipeline.execute();
    await pipeline.execute();

    const flags = forensicFlagsRepo.getAllFlags();
    assert.strictEqual(flags.length, 1);
    assert.strictEqual(flags[0].score, 50);
    const metadata = JSON.parse(flags[0].metadata!);
    assert.strictEqual(metadata.gap_days, 3);
    assert.strictEqual(metadata.range, '0-7');
  });
});
