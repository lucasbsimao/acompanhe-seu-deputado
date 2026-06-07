import * as assert from 'node:assert';
import { describe, it } from 'node:test';
import { CnpjPostdatesExpensePipeline } from '../../src/pipelines/forensics/CnpjPostdatesExpensePipeline';
import { ForensicFlag } from '../../src/pipelines/forensics/ForensicFlag';
import { useTestDatabase } from '../db/setup';
import { PoliticianRole } from '../../src/types/PoliticianRole';
import type Database from 'better-sqlite3';

function seedDeputy(db: Database.Database, cpf: string): void {
  db.prepare('INSERT OR IGNORE INTO parties (id, name, acronym) VALUES (?, ?, ?)').run(
    'pt',
    'PT',
    'PT',
  );
  db.prepare(
    `INSERT OR IGNORE INTO politicians (cpf, source_api_id, name, uf, party_id, role, photo_url, elected_as)
     VALUES (?, ?, ?, 'SP', 'pt', ?, NULL, 'ELEITO_POR_QP')`,
  ).run(cpf, cpf, `Deputy ${cpf}`, PoliticianRole.DEPUTY);
}

function seedExpense(
  db: Database.Database,
  id: string,
  deputyId: string,
  cnpj: string,
  dataDocumento: string,
): void {
  db.prepare(
    `INSERT INTO expenses (id, deputy_id, tipo_despesa, cod_documento, cod_tipo_documento,
      data_documento, num_documento, url_documento, nome_fornecedor, cnpj_cpf_fornecedor,
      valor_liquido, valor_glosa)
     VALUES (?, ?, 'MANUTENCAO', ?, 0, ?, 'NF-1', NULL, 'Vendor LTDA', ?, 10000, 0)`,
  ).run(id, deputyId, id, dataDocumento, cnpj);
}

function seedVendor(db: Database.Database, cnpj: string, openingDate: string | null): void {
  db.prepare(
    `INSERT OR IGNORE INTO vendors (cnpj, legal_name, primary_cnae, uf, municipio, opening_date,
      registration_status, registration_status_date, company_size)
     VALUES (?, 'Vendor LTDA', NULL, NULL, NULL, ?, NULL, NULL, NULL)`,
  ).run(cnpj, openingDate);
}

interface ForensicFlagRow {
  entity_id: string;
  flag_name: string;
  score: number;
  source_table: string;
  metadata: string | null;
}

function getFlags(db: Database.Database): ForensicFlagRow[] {
  return db.prepare('SELECT * FROM forensic_flags ORDER BY entity_id').all() as ForensicFlagRow[];
}

describe('CnpjPostdatesExpensePipeline Integration Tests', () => {
  const { getDb } = useTestDatabase();

  it('flags expense when vendor opening_date is strictly after data_documento', async () => {
    const db = getDb().db;
    seedDeputy(db, 'CPF001');
    seedExpense(db, 'EXP-1', 'CPF001', '11222333000181', '2023-06-01');
    seedVendor(db, '11222333000181', '2023-06-15');

    const pipeline = new CnpjPostdatesExpensePipeline(db);
    await pipeline.execute();

    const flags = getFlags(db);
    assert.strictEqual(flags.length, 1);
    assert.strictEqual(flags[0].entity_id, 'EXP-1');
    assert.strictEqual(flags[0].flag_name, ForensicFlag.CNPJ_POSTDATES_EXPENSE);
    assert.strictEqual(flags[0].score, 50);
    assert.strictEqual(flags[0].source_table, 'expenses');
    assert.strictEqual(flags[0].metadata, null);
  });

  it('does not flag when opening_date equals data_documento', async () => {
    const db = getDb().db;
    seedDeputy(db, 'CPF001');
    seedExpense(db, 'EXP-2', 'CPF001', '11222333000181', '2023-06-15');
    seedVendor(db, '11222333000181', '2023-06-15');

    const pipeline = new CnpjPostdatesExpensePipeline(db);
    await pipeline.execute();

    const flags = getFlags(db);
    assert.strictEqual(flags.length, 0);
  });

  it('does not flag when opening_date is before data_documento', async () => {
    const db = getDb().db;
    seedDeputy(db, 'CPF001');
    seedExpense(db, 'EXP-3', 'CPF001', '11222333000181', '2023-07-01');
    seedVendor(db, '11222333000181', '2023-06-15');

    const pipeline = new CnpjPostdatesExpensePipeline(db);
    await pipeline.execute();

    const flags = getFlags(db);
    assert.strictEqual(flags.length, 0);
  });

  it('does not flag when vendor opening_date is NULL', async () => {
    const db = getDb().db;
    seedDeputy(db, 'CPF001');
    seedExpense(db, 'EXP-4', 'CPF001', '11222333000181', '2023-06-01');
    seedVendor(db, '11222333000181', null);

    const pipeline = new CnpjPostdatesExpensePipeline(db);
    await pipeline.execute();

    const flags = getFlags(db);
    assert.strictEqual(flags.length, 0);
  });

  it('does not flag CPF vendor (length 11)', async () => {
    const db = getDb().db;
    seedDeputy(db, 'CPF001');
    db.prepare(
      `INSERT INTO expenses (id, deputy_id, tipo_despesa, cod_documento, cod_tipo_documento,
        data_documento, num_documento, url_documento, nome_fornecedor, cnpj_cpf_fornecedor,
        valor_liquido, valor_glosa)
       VALUES (?, ?, 'MANUTENCAO', ?, 0, ?, 'NF-1', NULL, 'Person', ?, 10000, 0)`,
    ).run('EXP-5', 'CPF001', 'EXP-5', '2023-06-01', '12345678901');
    db.prepare(
      `INSERT OR IGNORE INTO vendors (cnpj, legal_name, primary_cnae, uf, municipio, opening_date,
        registration_status, registration_status_date, company_size)
       VALUES (?, 'Person', NULL, NULL, NULL, '2023-06-15', NULL, NULL, NULL)`,
    ).run('12345678901');

    const pipeline = new CnpjPostdatesExpensePipeline(db);
    await pipeline.execute();

    const flags = getFlags(db);
    assert.strictEqual(flags.length, 0);
  });

  it('does not flag when no matching vendor row exists', async () => {
    const db = getDb().db;
    seedDeputy(db, 'CPF001');
    seedExpense(db, 'EXP-6', 'CPF001', '11222333000181', '2023-06-01');

    const pipeline = new CnpjPostdatesExpensePipeline(db);
    await pipeline.execute();

    const flags = getFlags(db);
    assert.strictEqual(flags.length, 0);
  });

  it('is idempotent — second execute does not duplicate flags', async () => {
    const db = getDb().db;
    seedDeputy(db, 'CPF001');
    seedExpense(db, 'EXP-7', 'CPF001', '11222333000181', '2023-06-01');
    seedVendor(db, '11222333000181', '2023-06-15');

    const pipeline = new CnpjPostdatesExpensePipeline(db);
    await pipeline.execute();
    await pipeline.execute();

    const flags = getFlags(db);
    assert.strictEqual(flags.length, 1);
  });
});
