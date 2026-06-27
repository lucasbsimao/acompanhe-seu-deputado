// SPDX-License-Identifier: AGPL-3.0-or-later

import * as assert from 'node:assert';
import { describe, it, beforeEach } from 'node:test';
import { CampaignDonorVendorPipeline } from '../../../src/pipelines/forensics/CampaignDonorVendorPipeline';
import { ForensicFlag } from '../../../src/pipelines/forensics/ForensicFlag';
import { useTestDatabase } from '../../db/setup';
import { TestPoliticianRepository } from '../../db/TestPoliticianRepository';
import { TestExpensesRepository } from '../../db/TestExpensesRepository';
import { TestVendorRepository } from '../../db/TestVendorRepository';
import { TestTseDonationsRepository } from '../../db/TestTseDonationsRepository';
import { TestForensicFlagsRepository } from '../../db/TestForensicFlagsRepository';

describe('CampaignDonorVendorPipeline Integration Tests', () => {
  const { getDb } = useTestDatabase();

  let db: ReturnType<typeof getDb>['db'];
  let politicianRepoTest: TestPoliticianRepository;
  let expensesRepoTest: TestExpensesRepository;
  let vendorRepoTest: TestVendorRepository;
  let donationsRepoTest: TestTseDonationsRepository;
  let forensicFlagsRepoTest: TestForensicFlagsRepository;

  beforeEach(() => {
    db = getDb().db;
    politicianRepoTest = new TestPoliticianRepository(db);
    expensesRepoTest = new TestExpensesRepository(db);
    vendorRepoTest = new TestVendorRepository(db);
    donationsRepoTest = new TestTseDonationsRepository(db);
    forensicFlagsRepoTest = new TestForensicFlagsRepository(db);
  });

  it('flags expense when vendor partner donated to the same deputy (happy path)', async () => {
    const deputyCpf = '11111111111';
    const cnpj = '11222333000181';
    const partnerCpf = '12345678901';
    const partnerName = 'JOAO DOADOR';

    politicianRepoTest.seedDeputy(deputyCpf);
    vendorRepoTest.seedMinimalVendor(cnpj, 'VENDOR LTDA');
    expensesRepoTest.seedExpense({
      id: 'EXP-1',
      politicianId: deputyCpf,
      cnpj: cnpj,
    });
    vendorRepoTest.seedPartner(cnpj, partnerCpf, partnerName);
    const donationId = donationsRepoTest.seedDonation({
      donor_cpf: partnerCpf,
      recipient_cpf: deputyCpf,
      ano_eleicao: 2022,
      valor: 1000,
    });

    const pipeline = new CampaignDonorVendorPipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepoTest.getAllFlags();
    assert.strictEqual(flags.length, 1);
    assert.strictEqual(flags[0].entity_id, 'EXP-1');
    assert.strictEqual(flags[0].flag_name, ForensicFlag.CAMPAIGN_DONOR_VENDOR);
    assert.strictEqual(flags[0].score, 30);

    const metadata = JSON.parse(flags[0].metadata as string);
    assert.ok(metadata.reference_data);
    assert.strictEqual(metadata.reference_data.length, 2);

    const vendorRef = metadata.reference_data.find(
      (r: any) => r.source_table === 'vendor_partners',
    );
    assert.strictEqual(vendorRef.source_id, `${cnpj}:${partnerCpf}`);

    const donationRef = metadata.reference_data.find(
      (r: any) => r.source_table === 'tse_donations',
    );
    assert.strictEqual(donationRef.source_id, donationId);
  });

  it('does not flag when partner donated to a different deputy', async () => {
    const deputyA = '11111111111';
    const deputyB = '22222222222';
    const cnpj = '11222333000181';
    const partnerCpf = '12345678901';

    politicianRepoTest.seedDeputy(deputyA);
    politicianRepoTest.seedDeputy(deputyB);
    vendorRepoTest.seedMinimalVendor(cnpj, 'VENDOR LTDA');
    expensesRepoTest.seedExpense({
      id: 'EXP-A',
      politicianId: deputyA,
      cnpj: cnpj,
    });
    vendorRepoTest.seedPartner(cnpj, partnerCpf, 'JOAO DOADOR');

    // Donation to deputy B, but expense is from deputy A
    donationsRepoTest.seedDonation({
      donor_cpf: partnerCpf,
      recipient_cpf: deputyB,
      ano_eleicao: 2022,
      valor: 1000,
    });

    const pipeline = new CampaignDonorVendorPipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepoTest.getAllFlags();
    assert.strictEqual(flags.length, 0);
  });

  it('does not flag when no vendor_partners row exists', async () => {
    const deputyCpf = '11111111111';
    const cnpj = '11222333000181';
    const partnerCpf = '12345678901';

    politicianRepoTest.seedDeputy(deputyCpf);
    expensesRepoTest.seedExpense({
      id: 'EXP-1',
      politicianId: deputyCpf,
      cnpj: cnpj,
    });
    // No seedPartner call
    donationsRepoTest.seedDonation({
      donor_cpf: partnerCpf,
      recipient_cpf: deputyCpf,
      ano_eleicao: 2022,
      valor: 1000,
    });

    const pipeline = new CampaignDonorVendorPipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepoTest.getAllFlags();
    assert.strictEqual(flags.length, 0);
  });

  it('is idempotent — second execute does not duplicate flags', async () => {
    const deputyCpf = '11111111111';
    const cnpj = '11222333000181';
    const partnerCpf = '12345678901';

    politicianRepoTest.seedDeputy(deputyCpf);
    vendorRepoTest.seedMinimalVendor(cnpj, 'VENDOR LTDA');
    expensesRepoTest.seedExpense({
      id: 'EXP-1',
      politicianId: deputyCpf,
      cnpj: cnpj,
    });
    vendorRepoTest.seedPartner(cnpj, partnerCpf, 'JOAO DOADOR');
    donationsRepoTest.seedDonation({
      donor_cpf: partnerCpf,
      recipient_cpf: deputyCpf,
      ano_eleicao: 2022,
      valor: 1000,
    });

    const pipeline = new CampaignDonorVendorPipeline(db);
    await pipeline.execute();
    await pipeline.execute();

    const flags = forensicFlagsRepoTest.getAllFlags();
    assert.strictEqual(flags.length, 1);
  });
});
