// SPDX-License-Identifier: AGPL-3.0-or-later

import * as assert from 'node:assert';
import { describe, it, beforeEach } from 'node:test';
import { SingleClientVendorPipeline } from '../../../src/pipelines/forensics/SingleClientVendorPipeline';
import { ForensicFlag } from '../../../src/pipelines/forensics/ForensicFlag';
import { useTestDatabase } from '../../db/setup';
import { TestPoliticianRepository } from '../../db/TestPoliticianRepository';
import { TestExpensesRepository } from '../../db/TestExpensesRepository';
import { TestForensicFlagsRepository } from '../../db/TestForensicFlagsRepository';

describe('SingleClientVendorPipeline Integration Tests', () => {
  const { getDb } = useTestDatabase();

  let db: ReturnType<typeof getDb>['db'];
  let politicianRepoTest: TestPoliticianRepository;
  let expensesRepoTest: TestExpensesRepository;
  let forensicFlagsRepoTest: TestForensicFlagsRepository;

  beforeEach(() => {
    db = getDb().db;
    politicianRepoTest = new TestPoliticianRepository(db);
    expensesRepoTest = new TestExpensesRepository(db);
    forensicFlagsRepoTest = new TestForensicFlagsRepository(db);
  });

  it('flags 5 expenses from the same vendor and same politician (happy path)', async () => {
    const deputyCpf = '11111111111';
    const cnpj = '11222333000181';

    politicianRepoTest.seedDeputy(deputyCpf);
    for (let i = 1; i <= 5; i++) {
      expensesRepoTest.seedExpense({
        id: `EXP-${i}`,
        politicianId: deputyCpf,
        cnpj: cnpj,
      });
    }

    const pipeline = new SingleClientVendorPipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepoTest.getAllFlags();
    assert.strictEqual(flags.length, 5);
    flags.forEach(flag => {
      assert.ok(flag.entity_id.startsWith('EXP-'));
      assert.strictEqual(flag.flag_name, ForensicFlag.SINGLE_CLIENT_VENDOR);
      assert.strictEqual(flag.score, 20);
    });
  });

  it('does not flag when vendor has only 4 expenses (below threshold)', async () => {
    const deputyCpf = '11111111111';
    const cnpj = '11222333000181';

    politicianRepoTest.seedDeputy(deputyCpf);
    for (let i = 1; i <= 4; i++) {
      expensesRepoTest.seedExpense({
        id: `EXP-${i}`,
        politicianId: deputyCpf,
        cnpj: cnpj,
      });
    }

    const pipeline = new SingleClientVendorPipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepoTest.getAllFlags();
    assert.strictEqual(flags.length, 0);
  });

  it('does not flag when vendor has expenses from 2 different politicians', async () => {
    const deputyA = '11111111111';
    const deputyB = '22222222222';
    const cnpj = '11222333000181';

    politicianRepoTest.seedDeputy(deputyA);
    politicianRepoTest.seedDeputy(deputyB);

    // 5 expenses for A, 1 for B -> total 6, but 2 politicians
    for (let i = 1; i <= 5; i++) {
      expensesRepoTest.seedExpense({
        id: `EXP-A-${i}`,
        politicianId: deputyA,
        cnpj: cnpj,
      });
    }
    expensesRepoTest.seedExpense({
      id: 'EXP-B-1',
      politicianId: deputyB,
      cnpj: cnpj,
    });

    const pipeline = new SingleClientVendorPipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepoTest.getAllFlags();
    assert.strictEqual(flags.length, 0);
  });

  it('does not flag empty corpus', async () => {
    const pipeline = new SingleClientVendorPipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepoTest.getAllFlags();
    assert.strictEqual(flags.length, 0);
  });

  it('is idempotent — second execute does not duplicate flags', async () => {
    const deputyCpf = '11111111111';
    const cnpj = '11222333000181';

    politicianRepoTest.seedDeputy(deputyCpf);
    for (let i = 1; i <= 5; i++) {
      expensesRepoTest.seedExpense({
        id: `EXP-${i}`,
        politicianId: deputyCpf,
        cnpj: cnpj,
      });
    }

    const pipeline = new SingleClientVendorPipeline(db);
    await pipeline.execute();
    await pipeline.execute();

    const flags = forensicFlagsRepoTest.getAllFlags();
    assert.strictEqual(flags.length, 5);
  });
});
