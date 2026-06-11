// SPDX-License-Identifier: AGPL-3.0-or-later

import * as assert from 'node:assert';
import { describe, it, beforeEach, afterEach } from 'node:test';
import nock from 'nock';
import AdmZip from 'adm-zip';
import { ReceitaFederalCNPJPipeline } from '../../src/pipelines/receita-federal/ReceitaFederalCNPJPipeline';
import { CompanySize } from '../../src/types/CompanySize';
import { useTestDatabase } from '../db/setup';
import { TestExpensesRepository } from '../db/TestExpensesRepository';
import { TestVendorRepository } from '../db/TestVendorRepository';
import { TestPoliticianRepository } from '../db/TestPoliticianRepository';

// Values from src/config/defaults.json
const WEBDAV_BASE = 'https://arquivos.receitafederal.gov.br';
const WEBDAV_PATH_PREFIX = '/public.php/webdav/2026-05';
const SHARE_TOKEN = 'YggdBLfdninEJX9';
const FILE_COUNT = 10;

// Test CNPJs — 14 digits (basic 8 + ordem 4 + dv 2)
const CNPJ_BASIC = '12345678';
const CNPJ_ORDEM = '0001';
const CNPJ_DV = '99';
const FULL_CNPJ = `${CNPJ_BASIC}${CNPJ_ORDEM}${CNPJ_DV}`; // 14 digits

/**
 * Build a zip buffer containing a single CSV file with the given content.
 */
function buildZipBuffer(filename: string, csvContent: string): Buffer {
  const zip = new AdmZip();
  zip.addFile(filename, Buffer.from(csvContent, 'latin1'));
  return zip.toBuffer();
}

/**
 * Build a Companies (Empresas) CSV row.
 * Columns: CNPJ_BASICO;RAZAO_SOCIAL;NATUREZA_JURIDICA;QUALIFICACAO_DO_RESPONSAVEL;CAPITAL_SOCIAL;PORTE_EMPRESA;ENTE_FEDERATIVO_RESPONSAVEL
 */
function buildEmpresaCsvRow(
  cnpjBasico: string,
  razaoSocial: string,
  porte = CompanySize.DEMAIS,
): string {
  return `${cnpjBasico};${razaoSocial};2062;50;100000.00;${porte};`;
}

/**
 * Build an Establishments (Estabelecimentos) CSV row.
 * Columns: CNPJ_BASICO;CNPJ_ORDEM;CNPJ_DV;TIPO_ESTABELECIMENTO;NOME_FANTASIA;SITUACAO_CADASTRAL;DATA_SITUACAO_CADASTRAL;...;UF;MUNICIPIO;...
 */
function buildEstabelecimentoCsvRow(
  cnpjBasico: string,
  cnpjOrdem: string,
  cnpjDv: string,
  options: {
    situacaoCadastral?: string;
    dataInicio?: string;
    uf?: string;
    municipio?: string;
    cnae?: string;
  } = {},
): string {
  const {
    situacaoCadastral = '02',
    dataInicio = '20150101',
    uf = 'SP',
    municipio = '7107',
    cnae = '6201501',
  } = options;
  // 30 columns total matching ESTABELECIMENTOS_COLUMNS
  return [
    cnpjBasico, // CNPJ_BASICO
    cnpjOrdem, // CNPJ_ORDEM
    cnpjDv, // CNPJ_DV
    '1', // TIPO_ESTABELECIMENTO
    '', // NOME_FANTASIA
    situacaoCadastral, // SITUACAO_CADASTRAL
    '20200101', // DATA_SITUACAO_CADASTRAL
    '00', // MOTIVO_SITUACAO_CADASTRAL
    '', // NOME_CIDADE_EXTERIOR
    '', // PAIS
    dataInicio, // DATA_INICIO_ATIVIDADE
    cnae, // CNAE_FISCAL_PRINCIPAL
    '', // CNAE_FISCAL_SECUNDARIA
    'RUA', // TIPO_LOGRADOURO
    'TESTE', // LOGRADOURO
    '100', // NUMERO
    '', // COMPLEMENTO
    'CENTRO', // BAIRRO
    '01310100', // CEP
    uf, // UF
    municipio, // MUNICIPIO
    '11', // DDD_1
    '999999999', // TELEFONE_1
    '', // DDD_2
    '', // TELEFONE_2
    '', // DDD_FAX
    '', // FAX
    '', // CORREIO_ELETRONICO
    '', // SITUACAO_ESPECIAL
    '', // DATA_SITUACAO_ESPECIAL
  ].join(';');
}

/**
 * Build a Partners (Socios) CSV row.
 * Columns: CNPJ_BASICO;IDENTIFICADOR_DE_SOCIO;NOME_SOCIO;CNPJ_CPF_DO_SOCIO;QUALIFICACAO_SOCIO;...
 */
function buildSocioCsvRow(
  cnpjBasico: string,
  nomeSocio: string,
  cnpjCpfSocio: string,
  qualificacao = '49',
): string {
  return [
    cnpjBasico, // CNPJ_BASICO
    '2', // IDENTIFICADOR_DE_SOCIO
    nomeSocio, // NOME_SOCIO
    cnpjCpfSocio, // CNPJ_CPF_DO_SOCIO
    qualificacao, // QUALIFICACAO_SOCIO
    '20100101', // DATA_ENTRADA_SOCIEDADE
    '', // PAIS
    '', // REPRESENTANTE_LEGAL
    '', // NOME_DO_REPRESENTANTE
    '', // QUALIFICACAO_REPRESENTANTE_LEGAL
    '3', // FAIXA_ETARIA
  ].join(';');
}

/**
 * Build a nock that serves an empty zip (no relevant CNPJs) for a given file path.
 */
function stubEmptyZip(scope: nock.Scope, filePath: string): void {
  const emptyZip = buildZipBuffer('empty.csv', '');
  scope
    .get(filePath)
    .basicAuth({ user: SHARE_TOKEN, pass: '' })
    .reply(200, emptyZip, { 'content-type': 'application/zip' });
}

/**
 * Stub all FILE_COUNT zips for a given file type with empty content, except for the given index
 * which gets the provided zip buffer.
 */
function stubAllZipsForType(fileTypeName: string, dataIndex: number, dataZipBuffer: Buffer): void {
  const scope = nock(WEBDAV_BASE);
  for (let i = 0; i < FILE_COUNT; i++) {
    const filePath = `${WEBDAV_PATH_PREFIX}/${fileTypeName}${i}.zip`;
    if (i === dataIndex) {
      scope
        .get(filePath)
        .basicAuth({ user: SHARE_TOKEN, pass: '' })
        .reply(200, dataZipBuffer, { 'content-type': 'application/zip' });
    } else {
      stubEmptyZip(scope, filePath);
    }
  }
}

interface VendorRow {
  cnpj: string;
  legal_name: string;
  uf: string | null;
  municipio: string | null;
  primary_cnae: string | null;
  opening_date: string | null;
  registration_status: string | null;
  company_size: string | null;
}

interface PartnerRow {
  cnpj: string;
  partner_name: string;
  partner_cpf_cnpj: string;
  partner_role: string;
}

interface CountRow {
  cnt: number;
}

describe('ReceitaFederalCNPJPipeline Integration Tests', () => {
  const { getDb } = useTestDatabase();

  let db: ReturnType<typeof getDb>['db'];
  let expensesRepo: TestExpensesRepository;
  let vendorRepo: TestVendorRepository;
  let politicianRepo: TestPoliticianRepository;

  beforeEach(() => {
    db = getDb().db;
    expensesRepo = new TestExpensesRepository(db);
    vendorRepo = new TestVendorRepository(db);
    politicianRepo = new TestPoliticianRepository(db);
    nock.cleanAll();
    nock.disableNetConnect();
  });

  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
  });

  it('persists vendor and partner from matching CNPJ in expenses — happy path', async () => {
    // Seed an expense with a known 14-digit CNPJ
    expensesRepo.seedExpenseWithCnpj(FULL_CNPJ, 'DOC001');

    // Build Companies zip: contains our CNPJ_BASIC
    const empresaCsv =
      buildEmpresaCsvRow(CNPJ_BASIC, 'EMPRESA TESTE LTDA', CompanySize.DEMAIS) + '\n';
    const empresasZip = buildZipBuffer('Empresas0.csv', empresaCsv);

    // Build Establishments zip: contains our full CNPJ
    const estabCsv =
      buildEstabelecimentoCsvRow(CNPJ_BASIC, CNPJ_ORDEM, CNPJ_DV, {
        situacaoCadastral: '02',
        dataInicio: '20150101',
        uf: 'SP',
        municipio: '7107',
        cnae: '6201501',
      }) + '\n';
    const estabZip = buildZipBuffer('Estabelecimentos0.csv', estabCsv);

    // Build Partners zip: partner is a person with a CPF (11-digit, filtered unless in known basic CNPJs)
    // We'll use a CNPJ partner (14-digit) whose basic is in knownBasicCnpjs
    const partnerCnpj = `${CNPJ_BASIC}000188`; // same basic, different establishment
    const socioCsv = buildSocioCsvRow(CNPJ_BASIC, 'SOCIO TESTE', partnerCnpj, '49') + '\n';
    const sociosZip = buildZipBuffer('Socios0.csv', socioCsv);

    // Stub all HTTP requests — only index 0 contains data
    stubAllZipsForType('Empresas', 0, empresasZip);
    stubAllZipsForType('Estabelecimentos', 0, estabZip);
    stubAllZipsForType('Socios', 0, sociosZip);

    const pipeline = new ReceitaFederalCNPJPipeline(db);
    await pipeline.execute(true);

    // Assert vendor row persisted
    const vendor = db.prepare('SELECT * FROM vendors WHERE cnpj = ?').get(FULL_CNPJ) as
      | VendorRow
      | undefined;
    assert.ok(vendor, 'Vendor row should be persisted');
    assert.strictEqual(vendor.cnpj, FULL_CNPJ, 'CNPJ should match');
    assert.strictEqual(
      vendor.legal_name,
      'EMPRESA TESTE LTDA',
      'Legal name should come from Companies file',
    );
    assert.strictEqual(vendor.uf, 'SP', 'UF should come from Establishments file');
    assert.strictEqual(vendor.municipio, '7107', 'Municipio should come from Establishments file');
    assert.strictEqual(vendor.primary_cnae, '6201501', 'CNAE should come from Establishments file');
    assert.strictEqual(
      vendor.opening_date,
      '20150101',
      'Opening date should come from Establishments file',
    );
    assert.strictEqual(vendor.registration_status, '02', 'Registration status should be persisted');
    assert.strictEqual(vendor.company_size, '05', 'Company size should come from Companies file');

    // Assert vendor_partners row persisted
    const partner = db.prepare('SELECT * FROM vendor_partners WHERE cnpj = ?').get(FULL_CNPJ) as
      | PartnerRow
      | undefined;
    assert.ok(partner, 'Partner row should be persisted');
    assert.strictEqual(partner.partner_name, 'SOCIO TESTE', 'Partner name should match');
    assert.strictEqual(partner.partner_cpf_cnpj, partnerCnpj, 'Partner CNPJ should match');
    assert.strictEqual(partner.partner_role, '49', 'Partner role should match');

    // Staging table should be cleaned up
    const stagingExists = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='vendor_companies_cache'",
      )
      .get();
    assert.ok(!stagingExists, 'Staging table should be dropped after pipeline completes');

    assert.ok(nock.isDone(), 'All HTTP mocks should be called');
  });

  it('skips all HTTP calls when vendors table already has data', async () => {
    // Pre-seed a vendor row so hasAnyVendors() returns true
    vendorRepo.seedMinimalVendor(FULL_CNPJ, 'Existing Vendor LTDA');

    // No HTTP mocks — any network call would throw
    const pipeline = new ReceitaFederalCNPJPipeline(db);
    await pipeline.execute(); // forceDownload defaults to false

    const count = (db.prepare('SELECT COUNT(*) as cnt FROM vendors').get() as CountRow).cnt;
    assert.strictEqual(count, 1, 'Vendors table should remain unchanged');
    assert.ok(nock.isDone(), 'No HTTP calls should have been made');
  });

  it('skips HTTP calls when no 14-digit CNPJs exist in expenses', async () => {
    // Seed an expense with a CPF (11 digits) — not a CNPJ, should be ignored
    politicianRepo.seedDeputy('99999999901', {
      name: 'Deputy CPF Only',
      sourceApiId: '99999',
      uf: 'RJ',
    });
    expensesRepo.seedExpense({
      id: '99999999901_DOCX01',
      deputyId: '99999999901',
      cnpj: '99999999901',
      numDocumento: 'NF-X',
    }); // 11-digit CPF, excluded by getDistinctCnpjs filter

    // No HTTP mocks — any network call would throw
    const pipeline = new ReceitaFederalCNPJPipeline(db);
    await pipeline.execute(true);

    const vendorCount = (db.prepare('SELECT COUNT(*) as cnt FROM vendors').get() as CountRow).cnt;
    assert.strictEqual(
      vendorCount,
      0,
      'No vendors should be inserted when no CNPJs exist in expenses',
    );
    assert.ok(nock.isDone(), 'No HTTP calls should have been made');
  });

  it('inserts vendor without partner when no matching partners exist in Socios files', async () => {
    expensesRepo.seedExpenseWithCnpj(FULL_CNPJ, 'DOC002');

    const empresaCsv =
      buildEmpresaCsvRow(CNPJ_BASIC, 'EMPRESA SEM SOCIOS LTDA', CompanySize.MICRO_EMPRESA) + '\n';
    const empresasZip = buildZipBuffer('Empresas0.csv', empresaCsv);

    const estabCsv = buildEstabelecimentoCsvRow(CNPJ_BASIC, CNPJ_ORDEM, CNPJ_DV) + '\n';
    const estabZip = buildZipBuffer('Estabelecimentos0.csv', estabCsv);

    // All Socios zips are empty — no partners for our CNPJ
    stubAllZipsForType('Empresas', 0, empresasZip);
    stubAllZipsForType('Estabelecimentos', 0, estabZip);
    // All Socios empty
    const sociosScope = nock(WEBDAV_BASE);
    for (let i = 0; i < FILE_COUNT; i++) {
      stubEmptyZip(sociosScope, `${WEBDAV_PATH_PREFIX}/Socios${i}.zip`);
    }

    const pipeline = new ReceitaFederalCNPJPipeline(db);
    await pipeline.execute(true);

    const vendor = db.prepare('SELECT * FROM vendors WHERE cnpj = ?').get(FULL_CNPJ) as
      | VendorRow
      | undefined;
    assert.ok(vendor, 'Vendor should be persisted even without partners');
    assert.strictEqual(vendor.legal_name, 'EMPRESA SEM SOCIOS LTDA');
    assert.strictEqual(vendor.company_size, CompanySize.MICRO_EMPRESA);

    const partnerCount = (
      db
        .prepare('SELECT COUNT(*) as cnt FROM vendor_partners WHERE cnpj = ?')
        .get(FULL_CNPJ) as CountRow
    ).cnt;
    assert.strictEqual(partnerCount, 0, 'No partners should be inserted');

    assert.ok(nock.isDone(), 'All HTTP mocks should be called');
  });

  it('does not insert vendor when CNPJ is absent from all Establishments files', async () => {
    expensesRepo.seedExpenseWithCnpj(FULL_CNPJ, 'DOC003');

    // Companies file has data but Establishments file does NOT have our CNPJ
    const empresaCsv = buildEmpresaCsvRow(CNPJ_BASIC, 'EMPRESA GHOST LTDA') + '\n';
    const empresasZip = buildZipBuffer('Empresas0.csv', empresaCsv);

    // Stub all requests — Establishments and Socios are all empty
    stubAllZipsForType('Empresas', 0, empresasZip);
    // All Estabelecimentos empty
    const estabScope = nock(WEBDAV_BASE);
    for (let i = 0; i < FILE_COUNT; i++) {
      stubEmptyZip(estabScope, `${WEBDAV_PATH_PREFIX}/Estabelecimentos${i}.zip`);
    }
    const sociosScope = nock(WEBDAV_BASE);
    for (let i = 0; i < FILE_COUNT; i++) {
      stubEmptyZip(sociosScope, `${WEBDAV_PATH_PREFIX}/Socios${i}.zip`);
    }

    const pipeline = new ReceitaFederalCNPJPipeline(db);
    await pipeline.execute(true);

    const vendorCount = (db.prepare('SELECT COUNT(*) as cnt FROM vendors').get() as CountRow).cnt;
    assert.strictEqual(
      vendorCount,
      0,
      'No vendor should be inserted if CNPJ is not in Establishments',
    );

    assert.ok(nock.isDone(), 'All HTTP mocks should be called');
  });

  it('filters out partners whose CPF/CNPJ basic is not in known basic CNPJs', async () => {
    expensesRepo.seedExpenseWithCnpj(FULL_CNPJ, 'DOC004');

    const empresaCsv = buildEmpresaCsvRow(CNPJ_BASIC, 'EMPRESA FILTRO LTDA') + '\n';
    const empresasZip = buildZipBuffer('Empresas0.csv', empresaCsv);

    const estabCsv = buildEstabelecimentoCsvRow(CNPJ_BASIC, CNPJ_ORDEM, CNPJ_DV) + '\n';
    const estabZip = buildZipBuffer('Estabelecimentos0.csv', estabCsv);

    // Partner has a 14-digit CNPJ whose basic is NOT in knownBasicCnpjs — should be filtered
    const unrelatedCnpj = '99999999000188'; // basic '99999999' not in expenses
    const socioCsv = buildSocioCsvRow(CNPJ_BASIC, 'SOCIO FILTRADO', unrelatedCnpj) + '\n';
    const sociosZip = buildZipBuffer('Socios0.csv', socioCsv);

    stubAllZipsForType('Empresas', 0, empresasZip);
    stubAllZipsForType('Estabelecimentos', 0, estabZip);
    stubAllZipsForType('Socios', 0, sociosZip);

    const pipeline = new ReceitaFederalCNPJPipeline(db);
    await pipeline.execute(true);

    const vendor = db.prepare('SELECT cnpj FROM vendors WHERE cnpj = ?').get(FULL_CNPJ) as
      | { cnpj: string }
      | undefined;
    assert.ok(vendor, 'Vendor should still be persisted');

    const partnerCount = (
      db.prepare('SELECT COUNT(*) as cnt FROM vendor_partners').get() as CountRow
    ).cnt;
    assert.strictEqual(partnerCount, 0, 'Partner with unrelated CNPJ basic should be filtered out');

    assert.ok(nock.isDone(), 'All HTTP mocks should be called');
  });

  it('force-downloads and populates vendors even when vendors table already has data', async () => {
    // Pre-seed a vendor row so hasAnyVendors() would return true
    vendorRepo.seedMinimalVendor('00000000000000', 'Existing Vendor');

    expensesRepo.seedExpenseWithCnpj(FULL_CNPJ, 'DOC005');

    const empresaCsv = buildEmpresaCsvRow(CNPJ_BASIC, 'NOVA EMPRESA LTDA') + '\n';
    const empresasZip = buildZipBuffer('Empresas0.csv', empresaCsv);

    const estabCsv = buildEstabelecimentoCsvRow(CNPJ_BASIC, CNPJ_ORDEM, CNPJ_DV) + '\n';
    const estabZip = buildZipBuffer('Estabelecimentos0.csv', estabCsv);

    stubAllZipsForType('Empresas', 0, empresasZip);
    stubAllZipsForType('Estabelecimentos', 0, estabZip);
    const sociosScope = nock(WEBDAV_BASE);
    for (let i = 0; i < FILE_COUNT; i++) {
      stubEmptyZip(sociosScope, `${WEBDAV_PATH_PREFIX}/Socios${i}.zip`);
    }

    const pipeline = new ReceitaFederalCNPJPipeline(db);
    await pipeline.execute(true); // forceDownload = true bypasses shouldSkip

    const newVendor = db.prepare('SELECT * FROM vendors WHERE cnpj = ?').get(FULL_CNPJ) as
      | VendorRow
      | undefined;
    assert.ok(newVendor, 'New vendor should be inserted via force-download');
    assert.strictEqual(newVendor.legal_name, 'NOVA EMPRESA LTDA');

    const totalVendors = (db.prepare('SELECT COUNT(*) as cnt FROM vendors').get() as CountRow).cnt;
    assert.strictEqual(totalVendors, 2, 'Both the pre-existing and new vendor should be present');

    assert.ok(nock.isDone(), 'All HTTP mocks should be called');
  });
});
