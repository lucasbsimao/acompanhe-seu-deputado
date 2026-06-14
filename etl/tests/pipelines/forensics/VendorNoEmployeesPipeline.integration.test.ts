// SPDX-License-Identifier: AGPL-3.0-or-later

import * as assert from 'node:assert';
import { describe, it, beforeEach } from 'node:test';
import { VendorNoEmployeesPipeline } from '../../../src/pipelines/forensics/VendorNoEmployeesPipeline';
import { ForensicFlag } from '../../../src/pipelines/forensics/ForensicFlag';
import { CompanySize } from '../../../src/types/CompanySize';
import { useTestDatabase } from '../../db/setup';
import { TestPoliticianRepository } from '../../db/TestPoliticianRepository';
import { TestExpensesRepository } from '../../db/TestExpensesRepository';
import { TestVendorRepository } from '../../db/TestVendorRepository';
import { TestForensicFlagsRepository } from '../../db/TestForensicFlagsRepository';

describe('VendorNoEmployeesPipeline Integration Tests', () => {
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

  it('flags 10pt proxy for company_size=01 with MANUTENCAO DE ESCRITORIO', async () => {
    politicianRepo.seedDeputy('CPF001');
    expensesRepo.seedExpense({
      id: 'EXP-1',
      politicianId: 'CPF001',
      cnpj: '11222333000181',
      tipoDespesa: 'MANUTENCAO DE ESCRITORIO',
    });
    // proxy signal: employeeCount is NULL, companySize is '01'
    vendorRepo.seedVendorWithCompanySize('11222333000181', CompanySize.MICRO_EMPRESA, null);

    const pipeline = new VendorNoEmployeesPipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepo.getAllFlags();
    assert.strictEqual(flags.length, 1);
    assert.strictEqual(flags[0].entity_id, 'EXP-1');
    assert.strictEqual(flags[0].flag_name, ForensicFlag.VENDOR_NO_EMPLOYEES);
    assert.strictEqual(flags[0].score, 10);
    const metadata = JSON.parse(flags[0].metadata!);
    assert.strictEqual(metadata.company_size, CompanySize.MICRO_EMPRESA);
    assert.strictEqual(metadata.employee_count, null);
  });

  it('flags 10pt proxy for company_size=01 with SERVICO DE SEGURANCA', async () => {
    politicianRepo.seedDeputy('CPF001');
    expensesRepo.seedExpense({
      id: 'EXP-1',
      politicianId: 'CPF001',
      cnpj: '11222333000181',
      tipoDespesa: 'SERVICO DE SEGURANCA',
    });
    vendorRepo.seedVendorWithCompanySize('11222333000181', CompanySize.MICRO_EMPRESA, null);

    const pipeline = new VendorNoEmployeesPipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepo.getAllFlags();
    assert.strictEqual(flags.length, 1);
    assert.strictEqual(flags[0].score, 10);
  });

  it('flags 10pt proxy for company_size=01 with LOCACAO OU FRETAMENTO DE VEICULOS', async () => {
    politicianRepo.seedDeputy('CPF001');
    expensesRepo.seedExpense({
      id: 'EXP-1',
      politicianId: 'CPF001',
      cnpj: '11222333000181',
      tipoDespesa: 'LOCACAO OU FRETAMENTO DE VEICULOS',
    });
    vendorRepo.seedVendorWithCompanySize('11222333000181', CompanySize.MICRO_EMPRESA, null);

    const pipeline = new VendorNoEmployeesPipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepo.getAllFlags();
    assert.strictEqual(flags.length, 1);
    assert.strictEqual(flags[0].score, 10);
  });

  it('flags 20pt full signal when employee_count=0', async () => {
    politicianRepo.seedDeputy('CPF001');
    expensesRepo.seedExpense({
      id: 'EXP-1',
      politicianId: 'CPF001',
      cnpj: '11222333000181',
      tipoDespesa: 'MANUTENCAO DE ESCRITORIO',
    });
    // full signal: employeeCount is 0, companySize is irrelevant (but could be '05' for MEI)
    vendorRepo.seedVendorWithCompanySize('11222333000181', CompanySize.DEMAIS, 0);

    const pipeline = new VendorNoEmployeesPipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepo.getAllFlags();
    assert.strictEqual(flags.length, 1);
    assert.strictEqual(flags[0].score, 20);
    const metadata = JSON.parse(flags[0].metadata!);
    assert.strictEqual(metadata.employee_count, 0);
  });

  it('does not flag if employee_count > 0', async () => {
    politicianRepo.seedDeputy('CPF001');
    expensesRepo.seedExpense({
      id: 'EXP-1',
      politicianId: 'CPF001',
      cnpj: '11222333000181',
      tipoDespesa: 'MANUTENCAO DE ESCRITORIO',
    });
    vendorRepo.seedVendorWithCompanySize('11222333000181', CompanySize.EMPRESA_DE_PEQUENO_PORTE, 5);

    const pipeline = new VendorNoEmployeesPipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepo.getAllFlags();
    assert.strictEqual(flags.length, 0);
  });

  it('does not flag company_size=01 with unrelated expense type', async () => {
    politicianRepo.seedDeputy('CPF001');
    expensesRepo.seedExpense({
      id: 'EXP-1',
      politicianId: 'CPF001',
      cnpj: '11222333000181',
      tipoDespesa: 'COMBUSTIVEIS E LUBRIFICANTES',
    });
    vendorRepo.seedVendorWithCompanySize('11222333000181', CompanySize.MICRO_EMPRESA, null);

    const pipeline = new VendorNoEmployeesPipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepo.getAllFlags();
    assert.strictEqual(flags.length, 0);
  });

  it('does not flag other company_size even if employee_count is NULL', async () => {
    politicianRepo.seedDeputy('CPF001');
    expensesRepo.seedExpense({
      id: 'EXP-1',
      politicianId: 'CPF001',
      cnpj: '11222333000181',
      tipoDespesa: 'MANUTENCAO DE ESCRITORIO',
    });
    // EPP is not Micro-empresa
    vendorRepo.seedVendorWithCompanySize(
      '11222333000181',
      CompanySize.EMPRESA_DE_PEQUENO_PORTE,
      null,
    );

    const pipeline = new VendorNoEmployeesPipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepo.getAllFlags();
    assert.strictEqual(flags.length, 0);
  });

  it('does not flag CPF vendor', async () => {
    politicianRepo.seedDeputy('CPF001');
    expensesRepo.seedExpense({
      id: 'EXP-1',
      politicianId: 'CPF001',
      cnpj: '12345678901',
      tipoDespesa: 'MANUTENCAO DE ESCRITORIO',
    });
    vendorRepo.seedVendorWithCompanySize('12345678901', CompanySize.MICRO_EMPRESA, null);

    const pipeline = new VendorNoEmployeesPipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepo.getAllFlags();
    assert.strictEqual(flags.length, 0);
  });

  it('is idempotent', async () => {
    politicianRepo.seedDeputy('CPF001');
    expensesRepo.seedExpense({
      id: 'EXP-1',
      politicianId: 'CPF001',
      cnpj: '11222333000181',
      tipoDespesa: 'MANUTENCAO DE ESCRITORIO',
    });
    vendorRepo.seedVendorWithCompanySize('11222333000181', CompanySize.MICRO_EMPRESA, null);

    const pipeline = new VendorNoEmployeesPipeline(db);
    await pipeline.execute();
    await pipeline.execute();

    const flags = forensicFlagsRepo.getAllFlags();
    assert.strictEqual(flags.length, 1);
  });
});
