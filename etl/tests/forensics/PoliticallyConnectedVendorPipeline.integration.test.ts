// SPDX-License-Identifier: AGPL-3.0-or-later

import * as assert from 'node:assert';
import { describe, it, beforeEach } from 'node:test';
import { PoliticallyConnectedVendorPipeline } from '../../src/pipelines/forensics/PoliticallyConnectedVendorPipeline';
import { ForensicFlag } from '../../src/pipelines/forensics/ForensicFlag';
import { useTestDatabase } from '../db/setup';
import { TestPoliticianRepository } from '../db/TestPoliticianRepository';
import { TestExpensesRepository } from '../db/TestExpensesRepository';
import { TestVendorRepository } from '../db/TestVendorRepository';
import { TestTseCandidatesRepository } from '../db/TestTseCandidatesRepository';
import { TestForensicFlagsRepository } from '../db/TestForensicFlagsRepository';

describe('PoliticallyConnectedVendorPipeline Integration Tests', () => {
  const { getDb } = useTestDatabase();

  let db: ReturnType<typeof getDb>['db'];
  let politicianRepoTest: TestPoliticianRepository;
  let expensesRepoTest: TestExpensesRepository;
  let vendorRepoTest: TestVendorRepository;
  let tseRepoTest: TestTseCandidatesRepository;
  let forensicFlagsRepoTest: TestForensicFlagsRepository;

  beforeEach(() => {
    db = getDb().db;
    politicianRepoTest = new TestPoliticianRepository(db);
    expensesRepoTest = new TestExpensesRepository(db);
    vendorRepoTest = new TestVendorRepository(db);
    tseRepoTest = new TestTseCandidatesRepository(db);
    forensicFlagsRepoTest = new TestForensicFlagsRepository(db);
  });

  it('flags expense when vendor partner is a TSE candidate (happy path)', async () => {
    const cnpj = '11222333000181';
    const partnerCpf = '12345678901';
    const partnerName = 'JOAO DA SILVA';

    politicianRepoTest.seedDeputy('DEPUTY001');
    vendorRepoTest.seedMinimalVendor(cnpj, 'VENDOR LTDA');
    expensesRepoTest.seedExpense({
      id: 'EXP-1',
      politicianId: 'DEPUTY001',
      cnpj: cnpj,
    });
    vendorRepoTest.seedPartner(cnpj, partnerCpf, partnerName);
    tseRepoTest.seedCandidate({ cpf: partnerCpf, nome: partnerName });

    const pipeline = new PoliticallyConnectedVendorPipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepoTest.getAllFlags();
    assert.strictEqual(flags.length, 1);
    assert.strictEqual(flags[0].entity_id, 'EXP-1');
    assert.strictEqual(flags[0].flag_name, ForensicFlag.POLITICALLY_CONNECTED_VENDOR);
    assert.strictEqual(flags[0].score, 50);

    const metadata = JSON.parse(flags[0].metadata as string);
    assert.strictEqual(metadata.partner_cpf, partnerCpf);
    assert.strictEqual(metadata.partner_name, partnerName);
  });

  it('does not flag when partner is not in tse_candidates', async () => {
    const cnpj = '11222333000181';
    const partnerCpf = '99999999999';

    politicianRepoTest.seedDeputy('DEPUTY001');
    vendorRepoTest.seedMinimalVendor(cnpj, 'VENDOR LTDA');
    expensesRepoTest.seedExpense({
      id: 'EXP-2',
      politicianId: 'DEPUTY001',
      cnpj: cnpj,
    });
    vendorRepoTest.seedPartner(cnpj, partnerCpf, 'NON CANDIDATE');

    const pipeline = new PoliticallyConnectedVendorPipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepoTest.getAllFlags();
    assert.strictEqual(flags.length, 0);
  });

  it('is idempotent — second execute does not duplicate flags', async () => {
    const cnpj = '11222333000181';
    const partnerCpf = '12345678901';

    politicianRepoTest.seedDeputy('DEPUTY001');
    vendorRepoTest.seedMinimalVendor(cnpj, 'VENDOR LTDA');
    expensesRepoTest.seedExpense({
      id: 'EXP-3',
      politicianId: 'DEPUTY001',
      cnpj: cnpj,
    });
    vendorRepoTest.seedPartner(cnpj, partnerCpf, 'JOAO DA SILVA');
    tseRepoTest.seedCandidate({ cpf: partnerCpf, nome: 'JOAO DA SILVA' });

    const pipeline = new PoliticallyConnectedVendorPipeline(db);
    await pipeline.execute();
    await pipeline.execute();

    const flags = forensicFlagsRepoTest.getAllFlags();
    assert.strictEqual(flags.length, 1);
  });

  it('does not flag when no vendor_partners row exists', async () => {
    const cnpj = '11222333000181';

    politicianRepoTest.seedDeputy('DEPUTY001');
    expensesRepoTest.seedExpense({
      id: 'EXP-4',
      politicianId: 'DEPUTY001',
      cnpj: cnpj,
    });
    // No seedPartner call

    const pipeline = new PoliticallyConnectedVendorPipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepoTest.getAllFlags();
    assert.strictEqual(flags.length, 0);
  });
});
