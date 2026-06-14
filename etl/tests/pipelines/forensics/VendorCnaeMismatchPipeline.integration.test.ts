// SPDX-License-Identifier: AGPL-3.0-or-later

import * as assert from 'node:assert';
import { describe, it, beforeEach } from 'node:test';
import { VendorCnaeMismatchPipeline } from '../../../src/pipelines/forensics/VendorCnaeMismatchPipeline';
import { ForensicFlag } from '../../../src/pipelines/forensics/ForensicFlag';
import { useTestDatabase } from '../../db/setup';
import { TestPoliticianRepository } from '../../db/TestPoliticianRepository';
import { TestExpensesRepository } from '../../db/TestExpensesRepository';
import { TestVendorRepository } from '../../db/TestVendorRepository';
import { TestForensicFlagsRepository } from '../../db/TestForensicFlagsRepository';

describe('VendorCnaeMismatchPipeline Integration Tests', () => {
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

  it('flags div 01 agriculture vendor with MANUTENCAO DE ESCRITORIO', async () => {
    politicianRepo.seedDeputy('CPF001');
    expensesRepo.seedExpense({
      id: 'EXP-1',
      politicianId: 'CPF001',
      cnpj: '11222333000181',
      tipoDespesa: 'MANUTENCAO DE ESCRITORIO',
    });
    vendorRepo.seedVendorWithCnae('11222333000181', '0151200');

    const pipeline = new VendorCnaeMismatchPipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepo.getAllFlags();
    assert.strictEqual(flags.length, 1);
    assert.strictEqual(flags[0].entity_id, 'EXP-1');
    assert.strictEqual(flags[0].flag_name, ForensicFlag.VENDOR_CNAE_MISMATCH);
    assert.strictEqual(flags[0].score, 25);
    const metadata = JSON.parse(flags[0].metadata!);
    assert.strictEqual(metadata.primary_cnae, '0151200');
    assert.strictEqual(metadata.tipo_despesa, 'MANUTENCAO DE ESCRITORIO');
  });

  it('flags div 10 food manufacturing vendor with LOCACAO OU FRETAMENTO DE VEICULOS', async () => {
    politicianRepo.seedDeputy('CPF001');
    expensesRepo.seedExpense({
      id: 'EXP-1',
      politicianId: 'CPF001',
      cnpj: '11222333000181',
      tipoDespesa: 'LOCACAO OU FRETAMENTO DE VEICULOS',
    });
    vendorRepo.seedVendorWithCnae('11222333000181', '1000100');

    const pipeline = new VendorCnaeMismatchPipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepo.getAllFlags();
    assert.strictEqual(flags.length, 1);
    assert.strictEqual(flags[0].entity_id, 'EXP-1');
    assert.strictEqual(flags[0].flag_name, ForensicFlag.VENDOR_CNAE_MISMATCH);
  });

  it('flags div 26 electronics manufacturing vendor with MANUTENCAO DE ESCRITORIO', async () => {
    politicianRepo.seedDeputy('CPF001');
    expensesRepo.seedExpense({
      id: 'EXP-1',
      politicianId: 'CPF001',
      cnpj: '11222333000181',
      tipoDespesa: 'MANUTENCAO DE ESCRITORIO',
    });
    vendorRepo.seedVendorWithCnae('11222333000181', '2600100');

    const pipeline = new VendorCnaeMismatchPipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepo.getAllFlags();
    assert.strictEqual(flags.length, 1);
    assert.strictEqual(flags[0].entity_id, 'EXP-1');
  });

  it('flags div 33 upper boundary of Section C with SERVICO DE SEGURANCA', async () => {
    politicianRepo.seedDeputy('CPF001');
    expensesRepo.seedExpense({
      id: 'EXP-1',
      politicianId: 'CPF001',
      cnpj: '11222333000181',
      tipoDespesa: 'SERVICO DE SEGURANCA',
    });
    vendorRepo.seedVendorWithCnae('11222333000181', '3300100');

    const pipeline = new VendorCnaeMismatchPipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepo.getAllFlags();
    assert.strictEqual(flags.length, 1);
    assert.strictEqual(flags[0].entity_id, 'EXP-1');
  });

  it('does not flag div 35 electricity vendor (first div after Section C)', async () => {
    politicianRepo.seedDeputy('CPF001');
    expensesRepo.seedExpense({
      id: 'EXP-1',
      politicianId: 'CPF001',
      cnpj: '11222333000181',
      tipoDespesa: 'MANUTENCAO DE ESCRITORIO',
    });
    vendorRepo.seedVendorWithCnae('11222333000181', '3500100');

    const pipeline = new VendorCnaeMismatchPipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepo.getAllFlags();
    assert.strictEqual(flags.length, 0);
  });

  it('does not flag div 70 professional services vendor', async () => {
    politicianRepo.seedDeputy('CPF001');
    expensesRepo.seedExpense({
      id: 'EXP-1',
      politicianId: 'CPF001',
      cnpj: '11222333000181',
      tipoDespesa: 'MANUTENCAO DE ESCRITORIO',
    });
    vendorRepo.seedVendorWithCnae('11222333000181', '7000100');

    const pipeline = new VendorCnaeMismatchPipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepo.getAllFlags();
    assert.strictEqual(flags.length, 0);
  });

  it('does not flag div 01 vendor with non-incompatible expense type', async () => {
    politicianRepo.seedDeputy('CPF001');
    expensesRepo.seedExpense({
      id: 'EXP-1',
      politicianId: 'CPF001',
      cnpj: '11222333000181',
      tipoDespesa: 'COMBUSTIVEIS E LUBRIFICANTES',
    });
    vendorRepo.seedVendorWithCnae('11222333000181', '0151200');

    const pipeline = new VendorCnaeMismatchPipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepo.getAllFlags();
    assert.strictEqual(flags.length, 0);
  });

  it('does not flag CPF vendor (length 11) even with incompatible CNAE and expense type', async () => {
    politicianRepo.seedDeputy('CPF001');
    expensesRepo.seedExpense({
      id: 'EXP-1',
      politicianId: 'CPF001',
      cnpj: '12345678901',
      tipoDespesa: 'MANUTENCAO DE ESCRITORIO',
    });
    vendorRepo.seedVendorWithCnae('12345678901', '0151200');

    const pipeline = new VendorCnaeMismatchPipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepo.getAllFlags();
    assert.strictEqual(flags.length, 0);
  });

  it('does not flag when vendor primary_cnae is NULL', async () => {
    politicianRepo.seedDeputy('CPF001');
    expensesRepo.seedExpense({
      id: 'EXP-1',
      politicianId: 'CPF001',
      cnpj: '11222333000181',
      tipoDespesa: 'MANUTENCAO DE ESCRITORIO',
    });
    vendorRepo.seedVendorWithCnae('11222333000181', null);

    const pipeline = new VendorCnaeMismatchPipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepo.getAllFlags();
    assert.strictEqual(flags.length, 0);
  });

  it('flags both expenses when div 01 vendor has two in-scope expenses', async () => {
    politicianRepo.seedDeputy('CPF001');
    politicianRepo.seedDeputy('CPF002');
    expensesRepo.seedExpense({
      id: 'EXP-1',
      politicianId: 'CPF001',
      cnpj: '11222333000181',
      tipoDespesa: 'MANUTENCAO DE ESCRITORIO',
    });
    expensesRepo.seedExpense({
      id: 'EXP-2',
      politicianId: 'CPF002',
      cnpj: '11222333000181',
      tipoDespesa: 'SERVICO DE SEGURANCA',
    });
    vendorRepo.seedVendorWithCnae('11222333000181', '0151200');

    const pipeline = new VendorCnaeMismatchPipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepo.getAllFlags();
    assert.strictEqual(flags.length, 2);
    assert.ok(flags.every(f => f.flag_name === ForensicFlag.VENDOR_CNAE_MISMATCH));
    assert.ok(flags.every(f => f.score === 25));
    const ids = flags.map(f => f.entity_id).sort();
    assert.deepStrictEqual(ids, ['EXP-1', 'EXP-2']);
  });

  it('is idempotent — second execute does not duplicate flags', async () => {
    politicianRepo.seedDeputy('CPF001');
    expensesRepo.seedExpense({
      id: 'EXP-1',
      politicianId: 'CPF001',
      cnpj: '11222333000181',
      tipoDespesa: 'MANUTENCAO DE ESCRITORIO',
    });
    vendorRepo.seedVendorWithCnae('11222333000181', '0151200');

    const pipeline = new VendorCnaeMismatchPipeline(db);
    await pipeline.execute();
    await pipeline.execute();

    const flags = forensicFlagsRepo.getAllFlags();
    assert.strictEqual(flags.length, 1);
    assert.strictEqual(flags[0].entity_id, 'EXP-1');
    assert.strictEqual(flags[0].score, 25);
  });
});
