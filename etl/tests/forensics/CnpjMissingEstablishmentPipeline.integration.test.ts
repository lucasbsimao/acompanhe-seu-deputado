import * as assert from 'node:assert';
import { describe, it, beforeEach } from 'node:test';
import { CnpjMissingEstablishmentPipeline } from '../../src/pipelines/forensics/CnpjMissingEstablishmentPipeline';
import { ForensicFlag } from '../../src/pipelines/forensics/ForensicFlag';
import { useTestDatabase } from '../db/setup';
import { TestPoliticianRepository } from '../db/TestPoliticianRepository';
import { TestExpensesRepository } from '../db/TestExpensesRepository';
import { TestVendorRepository } from '../db/TestVendorRepository';
import { TestForensicFlagsRepository } from '../db/TestForensicFlagsRepository';

describe('CnpjMissingEstablishmentPipeline Integration Tests', () => {
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

  it('flags expense when CNPJ vendor is missing from vendors table', async () => {
    politicianRepoTest.seedDeputy('CPF001');
    expensesRepoTest.seedExpense({
      id: 'EXP-1',
      deputyId: 'CPF001',
      cnpj: '11222333000181',
      dataDocumento: '2023-06-15',
    });
    // No vendor seeded - CNPJ is missing
    // Seed a fresh pipeline run to pass the freshness gate
    db.prepare(
      `INSERT INTO pipeline_runs (pipeline_name, completed_at, row_count)
       VALUES ('ReceitaFederalCNPJPipeline', datetime('now'), 0)`,
    ).run();

    const pipeline = new CnpjMissingEstablishmentPipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepoTest.getAllFlags();
    assert.strictEqual(flags.length, 1);
    assert.strictEqual(flags[0].entity_id, 'EXP-1');
    assert.strictEqual(flags[0].flag_name, ForensicFlag.CNPJ_MISSING_ESTABLISHMENT);
    assert.strictEqual(flags[0].score, 50);
    assert.strictEqual(flags[0].source_table, 'expenses');
    assert.strictEqual(flags[0].metadata, null);
  });

  it('does not flag CPF vendor (length 11) - individual vendors are suppressed', async () => {
    politicianRepoTest.seedDeputy('CPF001');
    expensesRepoTest.seedExpense({
      id: 'EXP-2',
      deputyId: 'CPF001',
      cnpj: '12345678901',
      dataDocumento: '2023-06-15',
    });
    // No vendor seeded for this CPF
    db.prepare(
      `INSERT INTO pipeline_runs (pipeline_name, completed_at, row_count)
       VALUES ('ReceitaFederalCNPJPipeline', datetime('now'), 0)`,
    ).run();

    const pipeline = new CnpjMissingEstablishmentPipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepoTest.getAllFlags();
    assert.strictEqual(flags.length, 0);
  });

  it('does not flag when pipeline run is absent (freshness gate)', async () => {
    politicianRepoTest.seedDeputy('CPF001');
    expensesRepoTest.seedExpense({
      id: 'EXP-3',
      deputyId: 'CPF001',
      cnpj: '11222333000182',
      dataDocumento: '2023-06-15',
    });
    // No pipeline run seeded

    const pipeline = new CnpjMissingEstablishmentPipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepoTest.getAllFlags();
    assert.strictEqual(flags.length, 0);
  });

  it('does not flag when pipeline run is stale (>45 days old)', async () => {
    politicianRepoTest.seedDeputy('CPF001');
    expensesRepoTest.seedExpense({
      id: 'EXP-4',
      deputyId: 'CPF001',
      cnpj: '11222333000183',
      dataDocumento: '2023-06-15',
    });
    // Seed a stale pipeline run (46 days ago)
    db.prepare(
      `INSERT INTO pipeline_runs (pipeline_name, completed_at, row_count)
       VALUES ('ReceitaFederalCNPJPipeline', datetime('now', '-46 days'), 0)`,
    ).run();

    const pipeline = new CnpjMissingEstablishmentPipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepoTest.getAllFlags();
    assert.strictEqual(flags.length, 0);
  });

  it('does not flag when vendor exists in vendors table', async () => {
    politicianRepoTest.seedDeputy('CPF001');
    expensesRepoTest.seedExpense({
      id: 'EXP-5',
      deputyId: 'CPF001',
      cnpj: '11222333000184',
      dataDocumento: '2023-06-15',
    });
    vendorRepoTest.seedVendor('11222333000184', '2020-01-01');
    db.prepare(
      `INSERT INTO pipeline_runs (pipeline_name, completed_at, row_count)
       VALUES ('ReceitaFederalCNPJPipeline', datetime('now'), 0)`,
    ).run();

    const pipeline = new CnpjMissingEstablishmentPipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepoTest.getAllFlags();
    assert.strictEqual(flags.length, 0);
  });

  it('is idempotent — second execute does not duplicate flags', async () => {
    politicianRepoTest.seedDeputy('CPF001');
    expensesRepoTest.seedExpense({
      id: 'EXP-6',
      deputyId: 'CPF001',
      cnpj: '11222333000185',
      dataDocumento: '2023-06-15',
    });
    db.prepare(
      `INSERT INTO pipeline_runs (pipeline_name, completed_at, row_count)
       VALUES ('ReceitaFederalCNPJPipeline', datetime('now'), 0)`,
    ).run();

    const pipeline = new CnpjMissingEstablishmentPipeline(db);
    await pipeline.execute();
    await pipeline.execute();

    const flags = forensicFlagsRepoTest.getAllFlags();
    assert.strictEqual(flags.length, 1);
    assert.strictEqual(flags[0].entity_id, 'EXP-6');
  });
});
