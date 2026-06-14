// SPDX-License-Identifier: AGPL-3.0-or-later

import * as assert from 'node:assert';
import { describe, it, beforeEach, afterEach } from 'node:test';
import nock from 'nock';
import AdmZip from 'adm-zip';
import { TSECampaignDonationsPipeline } from '../../../src/pipelines/tse-dados-abertos/TSECampaignDonationsPipeline';
import { TseDonationsRepository } from '../../../src/repositories/TseDonationsRepository';
import { useTestDatabase } from '../../db/setup';
import { TestTseCandidatesRepository } from '../../db/TestTseCandidatesRepository';
import { TestTseDonationsRepository } from '../../db/TestTseDonationsRepository';
import { makeCPF } from '../../db/TestPoliticianRepository';

const TSE_ORIGIN = 'https://cdn.tse.jus.br';

function buildDonationRow(opts: {
  NR_CPF_CANDIDATO: string;
  NR_CPF_CNPJ_DOADOR: string;
  VR_RECEITA: string;
}): string {
  // We only need the relevant columns. csv-parse with columns: true
  // will work as long as the header matches.
  return `${opts.NR_CPF_CANDIDATO};${opts.NR_CPF_CNPJ_DOADOR};${opts.VR_RECEITA}`;
}

function buildDonationZip(year: number, rows: string[]): Buffer {
  const header = 'NR_CPF_CANDIDATO;NR_CPF_CNPJ_DOADOR;VR_RECEITA';
  const csvContent = [header, ...rows].join('\n');
  const zip = new AdmZip();
  zip.addFile(`receitas_candidatos_${year}_BRASIL.csv`, Buffer.from(csvContent, 'latin1'));
  return zip.toBuffer();
}

function stubDonationZipDownload(year: number, zipBuffer: Buffer): void {
  const path = `/estatistica/sead/odsele/prestacao_contas/prestacao_de_contas_eleitorais_candidatos_${year}.zip`;
  nock(TSE_ORIGIN).get(path).reply(200, zipBuffer, { 'content-type': 'application/zip' });
}

describe('TSECampaignDonationsPipeline Integration Tests', () => {
  const { getDb } = useTestDatabase();
  let db: any;
  let candidatesRepo: TestTseCandidatesRepository;
  let testDonationsRepo: TestTseDonationsRepository;
  let donationsRepo: TseDonationsRepository;

  beforeEach(() => {
    db = getDb().db;
    candidatesRepo = new TestTseCandidatesRepository(db);
    testDonationsRepo = new TestTseDonationsRepository(db);
    donationsRepo = new TseDonationsRepository(db);
    nock.cleanAll();
    nock.disableNetConnect();
  });

  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
  });

  it('persists donations for elected candidates from TSE zip — happy path', async () => {
    const candidateCpf = makeCPF(1);
    const donorCpf = makeCPF(2);
    const otherCandidateCpf = makeCPF(3); // Not in tse_candidates

    // Seed target candidate
    candidatesRepo.seedCandidate({ cpf: candidateCpf, nome: 'CANDIDATO ELEITO' });

    const rows = [
      // Donation to elected candidate
      buildDonationRow({
        NR_CPF_CANDIDATO: candidateCpf,
        NR_CPF_CNPJ_DOADOR: donorCpf,
        VR_RECEITA: '1.250,50',
      }),
      // Another donation to same candidate
      buildDonationRow({
        NR_CPF_CANDIDATO: candidateCpf,
        NR_CPF_CNPJ_DOADOR: '99999999999',
        VR_RECEITA: '500,00',
      }),
      // Donation to non-elected candidate (should be filtered out)
      buildDonationRow({
        NR_CPF_CANDIDATO: otherCandidateCpf,
        NR_CPF_CNPJ_DOADOR: '00000000000',
        VR_RECEITA: '100,00',
      }),
    ];

    stubDonationZipDownload(2022, buildDonationZip(2022, rows));

    const pipeline = new TSECampaignDonationsPipeline(db);
    await pipeline.execute(true);

    assert.strictEqual(
      donationsRepo.count(),
      2,
      'Should persist 2 donations for the target candidate',
    );

    const donations = db.prepare('SELECT * FROM tse_donations ORDER BY valor DESC').all();

    assert.strictEqual(donations[0].recipient_cpf, candidateCpf);
    assert.strictEqual(donations[0].donor_cpf, donorCpf);
    assert.strictEqual(donations[0].valor, 125050); // 1250.50 * 100
    assert.strictEqual(donations[0].ano_eleicao, 2022);

    assert.strictEqual(donations[1].recipient_cpf, candidateCpf);
    assert.strictEqual(donations[1].valor, 50000);

    assert.ok(nock.isDone(), 'All HTTP mocks should be called');
  });

  it('skips download when tse_donations already has data', async () => {
    testDonationsRepo.seedDonation({
      donor_cpf: '123',
      recipient_cpf: '456',
      ano_eleicao: 2022,
      valor: 1000,
    });

    const pipeline = new TSECampaignDonationsPipeline(db);
    await pipeline.execute(); // forceDownload = false

    assert.strictEqual(donationsRepo.count(), 1, 'Should not have added new rows');
    assert.ok(nock.isDone(), 'No HTTP calls should have been made');
  });

  it('respects forceDownload even if data exists', async () => {
    testDonationsRepo.seedDonation({
      donor_cpf: '123',
      recipient_cpf: '456',
      ano_eleicao: 2022,
      valor: 1000,
    });

    const candidateCpf = makeCPF(1);
    candidatesRepo.seedCandidate({ cpf: candidateCpf, nome: 'CANDIDATO' });

    const rows = [
      buildDonationRow({
        NR_CPF_CANDIDATO: candidateCpf,
        NR_CPF_CNPJ_DOADOR: '789',
        VR_RECEITA: '50,00',
      }),
    ];

    stubDonationZipDownload(2022, buildDonationZip(2022, rows));

    const pipeline = new TSECampaignDonationsPipeline(db);
    await pipeline.execute(true); // forceDownload = true

    assert.strictEqual(donationsRepo.count(), 2, 'Should have added the new donation');
    assert.ok(nock.isDone(), 'HTTP mock should have been called');
  });

  it('filters out candidates not in tse_candidates', async () => {
    const targetCpf = makeCPF(10);
    const nonTargetCpf = makeCPF(20);

    candidatesRepo.seedCandidate({ cpf: targetCpf, nome: 'TARGET' });

    const rows = [
      buildDonationRow({
        NR_CPF_CANDIDATO: targetCpf,
        NR_CPF_CNPJ_DOADOR: '1',
        VR_RECEITA: '100,00',
      }),
      buildDonationRow({
        NR_CPF_CANDIDATO: nonTargetCpf,
        NR_CPF_CNPJ_DOADOR: '2',
        VR_RECEITA: '200,00',
      }),
    ];

    stubDonationZipDownload(2022, buildDonationZip(2022, rows));

    const pipeline = new TSECampaignDonationsPipeline(db);
    await pipeline.execute(true);

    assert.strictEqual(
      donationsRepo.count(),
      1,
      'Should only persist the donation for the target candidate',
    );
    const saved = db.prepare('SELECT * FROM tse_donations').get() as any;
    assert.strictEqual(saved.recipient_cpf, targetCpf);
  });

  it('handles malformed VR_RECEITA values by skipping them', async () => {
    const candidateCpf = makeCPF(1);
    candidatesRepo.seedCandidate({ cpf: candidateCpf, nome: 'CANDIDATO' });

    const rows = [
      buildDonationRow({
        NR_CPF_CANDIDATO: candidateCpf,
        NR_CPF_CNPJ_DOADOR: '1',
        VR_RECEITA: '100,00',
      }),
      buildDonationRow({
        NR_CPF_CANDIDATO: candidateCpf,
        NR_CPF_CNPJ_DOADOR: '2',
        VR_RECEITA: 'INVALID',
      }),
    ];

    stubDonationZipDownload(2022, buildDonationZip(2022, rows));

    const pipeline = new TSECampaignDonationsPipeline(db);
    await pipeline.execute(true);

    assert.strictEqual(donationsRepo.count(), 1, 'Should skip the row with invalid numeric amount');
  });

  it('handles CNPJ donors correctly', async () => {
    const candidateCpf = makeCPF(1);
    const donorCnpj = '12345678000199';
    candidatesRepo.seedCandidate({ cpf: candidateCpf, nome: 'CANDIDATO' });

    const rows = [
      buildDonationRow({
        NR_CPF_CANDIDATO: candidateCpf,
        NR_CPF_CNPJ_DOADOR: donorCnpj,
        VR_RECEITA: '100,00',
      }),
    ];

    stubDonationZipDownload(2022, buildDonationZip(2022, rows));

    const pipeline = new TSECampaignDonationsPipeline(db);
    await pipeline.execute(true);

    const saved = db.prepare('SELECT * FROM tse_donations').get() as any;
    assert.strictEqual(saved.donor_cpf, donorCnpj, 'Should store the 14-digit CNPJ correctly');
  });
});
