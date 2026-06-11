// SPDX-License-Identifier: AGPL-3.0-or-later

import * as assert from 'node:assert';
import { describe, it, beforeEach, afterEach } from 'node:test';
import nock from 'nock';
import AdmZip from 'adm-zip';
import { ReceitaFederalSimplesPipeline } from '../../src/pipelines/receita-federal/ReceitaFederalSimplesPipeline';
import { useTestDatabase } from '../db/setup';
import { TestExpensesRepository } from '../db/TestExpensesRepository';
import { TestVendorRepository } from '../db/TestVendorRepository';

const WEBDAV_BASE = 'https://arquivos.receitafederal.gov.br';
const WEBDAV_PATH_PREFIX = '/public.php/webdav/2026-05';
const SHARE_TOKEN = 'YggdBLfdninEJX9';
const SIMPLES_FILENAME = 'Simples.zip';

const CNPJ_BASIC_MEI = '12345678';
const CNPJ_FULL_MEI = '12345678000199';
const CNPJ_BASIC_REGULAR = '87654321';
const CNPJ_FULL_REGULAR = '87654321000100';

function buildZipBuffer(filename: string, csvContent: string): Buffer {
  const zip = new AdmZip();
  zip.addFile(filename, Buffer.from(csvContent, 'latin1'));
  return zip.toBuffer();
}

/**
 * Columns: CNPJ_BASICO ; OPCAO_PELO_SIMPLES ; DATA_DE_OPCAO_PELO_SIMPLES ;
 * DATA_DE_EXCLUSAO_DO_SIMPLES ; OPCAO_PELO_MEI ; DATA_DE_OPCAO_PELO_MEI ;
 * DATA_DE_EXCLUSAO_DO_MEI
 */
function buildSimplesCsvRow(cnpjBasico: string, isMei: boolean): string {
  const meiFlag = isMei ? 'S' : 'N';
  return `${cnpjBasico};S;20200101;;${meiFlag};20200101;`;
}

describe('ReceitaFederalSimplesPipeline Integration Tests', () => {
  const { getDb } = useTestDatabase();

  let db: ReturnType<typeof getDb>['db'];
  let expensesRepo: TestExpensesRepository;
  let vendorRepo: TestVendorRepository;

  beforeEach(() => {
    db = getDb().db;
    expensesRepo = new TestExpensesRepository(db);
    vendorRepo = new TestVendorRepository(db);
    nock.cleanAll();
    nock.disableNetConnect();
  });

  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
  });

  it('updates employee_count to 0 for MEI vendors', async () => {
    // Seed vendors and expenses
    vendorRepo.seedMinimalVendor(CNPJ_FULL_MEI, 'MEI VENDOR LTDA');
    vendorRepo.seedMinimalVendor(CNPJ_FULL_REGULAR, 'REGULAR VENDOR LTDA');
    expensesRepo.seedExpenseWithCnpj(CNPJ_FULL_MEI, 'DOC001');
    expensesRepo.seedExpenseWithCnpj(CNPJ_FULL_REGULAR, 'DOC002');

    // Build Simples zip
    const csvContent =
      [
        buildSimplesCsvRow(CNPJ_BASIC_MEI, true),
        buildSimplesCsvRow(CNPJ_BASIC_REGULAR, false),
      ].join('\n') + '\n';
    const zipBuffer = buildZipBuffer('Simples.csv', csvContent);

    // Mock HTTP
    nock(WEBDAV_BASE)
      .get(`${WEBDAV_PATH_PREFIX}/${SIMPLES_FILENAME}`)
      .basicAuth({ user: SHARE_TOKEN, pass: '' })
      .reply(200, zipBuffer, { 'content-type': 'application/zip' });

    const pipeline = new ReceitaFederalSimplesPipeline(db);
    await pipeline.execute();

    // Verify MEI vendor has employee_count = 0
    const meiVendor = db
      .prepare('SELECT employee_count FROM vendors WHERE cnpj = ?')
      .get(CNPJ_FULL_MEI) as { employee_count: number | null };
    assert.strictEqual(meiVendor.employee_count, 0, 'MEI vendor should have employee_count = 0');

    // Verify regular vendor has employee_count IS NULL
    const regularVendor = db
      .prepare('SELECT employee_count FROM vendors WHERE cnpj = ?')
      .get(CNPJ_FULL_REGULAR) as { employee_count: number | null };
    assert.strictEqual(
      regularVendor.employee_count,
      null,
      'Regular vendor should have null employee_count',
    );

    assert.ok(nock.isDone(), 'HTTP mock should be called');
  });

  it('skips execution if no CNPJs found in expenses', async () => {
    // No expenses seeded
    const pipeline = new ReceitaFederalSimplesPipeline(db);
    await pipeline.execute();

    assert.strictEqual(nock.pendingMocks().length, 0, 'No HTTP calls should have been made');
  });

  it('handles empty Simples file gracefully', async () => {
    expensesRepo.seedExpenseWithCnpj(CNPJ_FULL_MEI, 'DOC001');

    const zipBuffer = buildZipBuffer('Simples.csv', '');
    nock(WEBDAV_BASE)
      .get(`${WEBDAV_PATH_PREFIX}/${SIMPLES_FILENAME}`)
      .basicAuth({ user: SHARE_TOKEN, pass: '' })
      .reply(200, zipBuffer, { 'content-type': 'application/zip' });

    const pipeline = new ReceitaFederalSimplesPipeline(db);
    await pipeline.execute();

    assert.ok(nock.isDone());
  });

  it('ignores CNPJs not present in expenses', async () => {
    const UNKNOWN_CNPJ_BASIC = '99999999';
    vendorRepo.seedMinimalVendor('99999999000188', 'UNKNOWN VENDOR');
    // NO expense for this CNPJ

    const csvContent = buildSimplesCsvRow(UNKNOWN_CNPJ_BASIC, true) + '\n';
    const zipBuffer = buildZipBuffer('Simples.csv', csvContent);

    nock(WEBDAV_BASE)
      .get(`${WEBDAV_PATH_PREFIX}/${SIMPLES_FILENAME}`)
      .basicAuth({ user: SHARE_TOKEN, pass: '' })
      .reply(200, zipBuffer, { 'content-type': 'application/zip' });

    const pipeline = new ReceitaFederalSimplesPipeline(db);
    await pipeline.execute();

    const vendor = db
      .prepare('SELECT employee_count FROM vendors WHERE cnpj = ?')
      .get('99999999000188') as { employee_count: number | null };
    assert.strictEqual(vendor.employee_count, null, 'Unrelated vendor should not be updated');
  });
});
