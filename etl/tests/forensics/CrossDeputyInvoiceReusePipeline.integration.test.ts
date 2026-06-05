import * as assert from 'node:assert';
import { describe, it } from 'node:test';
import { CrossDeputyInvoiceReusePipeline } from '../../src/pipelines/forensics/CrossDeputyInvoiceReusePipeline';
import { ForensicFlag } from '../../src/pipelines/forensics/ForensicFlag';
import { useTestDatabase } from '../db/setup';
import { PoliticianRole } from '../../src/types/PoliticianRole';
import type Database from 'better-sqlite3';

interface ExpenseSeed {
  id: string;
  deputyId: string;
  cnpj: string;
  numDocumento: string;
}

function seedDeputy(db: Database.Database, cpf: string): void {
  db.prepare('INSERT OR IGNORE INTO parties (id, name, acronym) VALUES (?, ?, ?)').run('pt', 'PT', 'PT');
  db.prepare(
    `INSERT OR IGNORE INTO politicians (cpf, source_api_id, name, uf, party_id, role, photo_url, elected_as)
     VALUES (?, ?, ?, 'SP', 'pt', ?, NULL, 'ELEITO_POR_QP')`
  ).run(cpf, cpf, `Deputy ${cpf}`, PoliticianRole.DEPUTY);
}

function seedExpense(db: Database.Database, { id, deputyId, cnpj, numDocumento }: ExpenseSeed): void {
  db.prepare(
    `INSERT INTO expenses (id, deputy_id, tipo_despesa, cod_documento, cod_tipo_documento,
      data_documento, num_documento, url_documento, nome_fornecedor, cnpj_cpf_fornecedor,
      valor_liquido, valor_glosa)
     VALUES (?, ?, 'MANUTENCAO', ?, 0, '2024-01-01', ?, NULL, 'Vendor LTDA', ?, 10000, 0)`
  ).run(id, deputyId, id, numDocumento, cnpj);
}

function getFlags(db: Database.Database): Array<{ entity_id: string; flag_name: string; score: number; source_table: string; metadata: string | null }> {
  return db.prepare('SELECT * FROM forensic_flags ORDER BY entity_id').all() as any[];
}

describe('CrossDeputyInvoiceReusePipeline Integration Tests', () => {
  const { getDb } = useTestDatabase();

  it('flags expenses when same (cnpj, num_documento) appears under 2 distinct deputies', async () => {
    const db = getDb().db;
    seedDeputy(db, 'CPF001');
    seedDeputy(db, 'CPF002');
    seedExpense(db, { id: 'EXP-A1', deputyId: 'CPF001', cnpj: '11222333000181', numDocumento: 'NF-100' });
    seedExpense(db, { id: 'EXP-A2', deputyId: 'CPF002', cnpj: '11222333000181', numDocumento: 'NF-100' });

    const pipeline = new CrossDeputyInvoiceReusePipeline(db);
    await pipeline.execute();

    const flags = getFlags(db);
    assert.strictEqual(flags.length, 2, 'Both expenses should be flagged');

    const ids = flags.map(f => f.entity_id).sort();
    assert.deepStrictEqual(ids, ['EXP-A1', 'EXP-A2']);

    assert.strictEqual(flags[0].flag_name, ForensicFlag.CROSS_DEPUTY_INVOICE_REUSE);
    assert.strictEqual(flags[0].source_table, 'expenses');
    assert.strictEqual(flags[0].score, 50);
    assert.strictEqual(flags[0].metadata, null);
  });

  it('flags all 3 expenses when same invoice is shared by 3 distinct deputies', async () => {
    const db = getDb().db;
    seedDeputy(db, 'CPF001');
    seedDeputy(db, 'CPF002');
    seedDeputy(db, 'CPF003');
    seedExpense(db, { id: 'EXP-B1', deputyId: 'CPF001', cnpj: '99000000000191', numDocumento: 'NF-999' });
    seedExpense(db, { id: 'EXP-B2', deputyId: 'CPF002', cnpj: '99000000000191', numDocumento: 'NF-999' });
    seedExpense(db, { id: 'EXP-B3', deputyId: 'CPF003', cnpj: '99000000000191', numDocumento: 'NF-999' });

    const pipeline = new CrossDeputyInvoiceReusePipeline(db);
    await pipeline.execute();

    const flags = getFlags(db);
    assert.strictEqual(flags.length, 3, 'All 3 expenses should be flagged');
  });

  it('does not flag when same (cnpj, num_documento) pair belongs to only one deputy', async () => {
    const db = getDb().db;
    seedDeputy(db, 'CPF001');
    seedExpense(db, { id: 'EXP-C1', deputyId: 'CPF001', cnpj: '11222333000181', numDocumento: 'NF-200' });
    seedExpense(db, { id: 'EXP-C2', deputyId: 'CPF001', cnpj: '11222333000181', numDocumento: 'NF-200' });

    const pipeline = new CrossDeputyInvoiceReusePipeline(db);
    await pipeline.execute();

    const flags = getFlags(db);
    assert.strictEqual(flags.length, 0, 'Same-deputy duplicates should not be flagged');
  });

  it('does not flag when different vendors share the same document number', async () => {
    const db = getDb().db;
    seedDeputy(db, 'CPF001');
    seedDeputy(db, 'CPF002');
    seedExpense(db, { id: 'EXP-D1', deputyId: 'CPF001', cnpj: 'CNPJ-AAA', numDocumento: 'NF-SHARED' });
    seedExpense(db, { id: 'EXP-D2', deputyId: 'CPF002', cnpj: 'CNPJ-BBB', numDocumento: 'NF-SHARED' });

    const pipeline = new CrossDeputyInvoiceReusePipeline(db);
    await pipeline.execute();

    const flags = getFlags(db);
    assert.strictEqual(flags.length, 0, 'Different vendors with same num_documento should not be flagged');
  });

  it('does not flag when there are no expenses', async () => {
    const db = getDb().db;

    const pipeline = new CrossDeputyInvoiceReusePipeline(db);
    await pipeline.execute();

    const flags = getFlags(db);
    assert.strictEqual(flags.length, 0);
  });

  it('is idempotent — second execute does not duplicate flags', async () => {
    const db = getDb().db;
    seedDeputy(db, 'CPF001');
    seedDeputy(db, 'CPF002');
    seedExpense(db, { id: 'EXP-E1', deputyId: 'CPF001', cnpj: '55000000000100', numDocumento: 'NF-IDEM' });
    seedExpense(db, { id: 'EXP-E2', deputyId: 'CPF002', cnpj: '55000000000100', numDocumento: 'NF-IDEM' });

    const pipeline = new CrossDeputyInvoiceReusePipeline(db);
    await pipeline.execute();
    await pipeline.execute();

    const flags = getFlags(db);
    assert.strictEqual(flags.length, 2, 'Re-run should not create duplicate flags');
  });

  it('only flags cross-deputy expenses and ignores unrelated clean expenses', async () => {
    const db = getDb().db;
    seedDeputy(db, 'CPF001');
    seedDeputy(db, 'CPF002');
    seedExpense(db, { id: 'EXP-F1', deputyId: 'CPF001', cnpj: '77000000000177', numDocumento: 'NF-CROSS' });
    seedExpense(db, { id: 'EXP-F2', deputyId: 'CPF002', cnpj: '77000000000177', numDocumento: 'NF-CROSS' });
    seedExpense(db, { id: 'EXP-F3', deputyId: 'CPF001', cnpj: '88000000000188', numDocumento: 'NF-UNIQUE' });

    const pipeline = new CrossDeputyInvoiceReusePipeline(db);
    await pipeline.execute();

    const flags = getFlags(db);
    assert.strictEqual(flags.length, 2, 'Only the cross-deputy pair should be flagged');
    const ids = flags.map(f => f.entity_id).sort();
    assert.deepStrictEqual(ids, ['EXP-F1', 'EXP-F2']);
  });

  describe('S/N placeholder exclusion', () => {
    const snVariants = ['S/N', 'SN', 'S.N.', 'S/Nº', '00', '000', '0', '-', ''];

    for (const variant of snVariants) {
      it(`excludes num_documento = "${variant}" from cross-deputy detection`, async () => {
        const db = getDb().db;
        seedDeputy(db, 'CPF001');
        seedDeputy(db, 'CPF002');
        seedExpense(db, { id: 'EXP-SN1', deputyId: 'CPF001', cnpj: '12300000000100', numDocumento: variant });
        seedExpense(db, { id: 'EXP-SN2', deputyId: 'CPF002', cnpj: '12300000000100', numDocumento: variant });

        const pipeline = new CrossDeputyInvoiceReusePipeline(db);
        await pipeline.execute();

        const flags = getFlags(db);
        assert.strictEqual(flags.length, 0, `Expenses with num_documento="${variant}" should not be flagged`);
      });
    }

    it('excludes lowercase s/n variants via TRIM(UPPER) normalisation', async () => {
      const db = getDb().db;
      seedDeputy(db, 'CPF001');
      seedDeputy(db, 'CPF002');
      seedExpense(db, { id: 'EXP-LC1', deputyId: 'CPF001', cnpj: '45600000000100', numDocumento: 's/n' });
      seedExpense(db, { id: 'EXP-LC2', deputyId: 'CPF002', cnpj: '45600000000100', numDocumento: 's/n' });

      const pipeline = new CrossDeputyInvoiceReusePipeline(db);
      await pipeline.execute();

      const flags = getFlags(db);
      assert.strictEqual(flags.length, 0, 'Lowercase s/n should be normalised to S/N and excluded');
    });

    it('excludes num_documento with surrounding whitespace via TRIM', async () => {
      const db = getDb().db;
      seedDeputy(db, 'CPF001');
      seedDeputy(db, 'CPF002');
      seedExpense(db, { id: 'EXP-WS1', deputyId: 'CPF001', cnpj: '78900000000100', numDocumento: '  S/N  ' });
      seedExpense(db, { id: 'EXP-WS2', deputyId: 'CPF002', cnpj: '78900000000100', numDocumento: '  S/N  ' });

      const pipeline = new CrossDeputyInvoiceReusePipeline(db);
      await pipeline.execute();

      const flags = getFlags(db);
      assert.strictEqual(flags.length, 0, 'Whitespace-padded S/N should be excluded after TRIM');
    });

    it('does flag a legitimate invoice number that resembles but differs from S/N placeholders', async () => {
      const db = getDb().db;
      seedDeputy(db, 'CPF001');
      seedDeputy(db, 'CPF002');
      seedExpense(db, { id: 'EXP-LG1', deputyId: 'CPF001', cnpj: '32100000000199', numDocumento: '0001' });
      seedExpense(db, { id: 'EXP-LG2', deputyId: 'CPF002', cnpj: '32100000000199', numDocumento: '0001' });

      const pipeline = new CrossDeputyInvoiceReusePipeline(db);
      await pipeline.execute();

      const flags = getFlags(db);
      assert.strictEqual(flags.length, 2, '"0001" is not in the S/N exclusion list and should be flagged');
    });
  });
});
