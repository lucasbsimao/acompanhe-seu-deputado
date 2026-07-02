// SPDX-License-Identifier: AGPL-3.0-or-later

import * as assert from 'node:assert';
import { describe, it, beforeEach } from 'node:test';
import { DuplicateInvoicePipeline } from '../../../src/pipelines/forensics/DuplicateInvoicePipeline';
import { ForensicFlag } from '../../../src/pipelines/forensics/ForensicFlag';
import { useTestDatabase } from '../../db/setup';
import { TestPoliticianRepository } from '../../db/TestPoliticianRepository';
import { TestExpensesRepository } from '../../db/TestExpensesRepository';
import { TestForensicFlagsRepository } from '../../db/TestForensicFlagsRepository';

describe('DuplicateInvoicePipeline Integration Tests', () => {
  const { getDb } = useTestDatabase();

  let db: ReturnType<typeof getDb>['db'];
  let politicianRepo: TestPoliticianRepository;
  let expensesRepo: TestExpensesRepository;
  let forensicFlagsRepo: TestForensicFlagsRepository;

  beforeEach(() => {
    db = getDb().db;
    politicianRepo = new TestPoliticianRepository(db);
    expensesRepo = new TestExpensesRepository(db);
    forensicFlagsRepo = new TestForensicFlagsRepository(db);
  });

  it('flags expenses when same (cnpj, num_documento) appears twice for the same politician', async () => {
    politicianRepo.seedDeputy('CPF001');
    expensesRepo.seedExpense({
      id: 'EXP-1',
      politicianId: 'CPF001',
      cnpj: '11222333000181',
      numDocumento: 'NF-100',
    });
    expensesRepo.seedExpense({
      id: 'EXP-2',
      politicianId: 'CPF001',
      cnpj: '11222333000181',
      numDocumento: 'NF-100',
    });

    const pipeline = new DuplicateInvoicePipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepo.getAllFlags();
    assert.strictEqual(flags.length, 2, 'Both expenses should be flagged');

    const ids = flags.map(f => f.entity_id).sort();
    assert.deepStrictEqual(ids, ['EXP-1', 'EXP-2']);

    assert.strictEqual(flags[0].flag_name, ForensicFlag.DUPLICATE_INVOICE);
    assert.strictEqual(flags[0].score, 40);
    assert.strictEqual(flags[0].metadata, null);
  });

  it('flags all 3 expenses when same politician has 3 expenses with the same pair', async () => {
    politicianRepo.seedDeputy('CPF001');
    expensesRepo.seedExpense({
      id: 'E1',
      politicianId: 'CPF001',
      cnpj: 'CNPJ1',
      numDocumento: 'DOC1',
    });
    expensesRepo.seedExpense({
      id: 'E2',
      politicianId: 'CPF001',
      cnpj: 'CNPJ1',
      numDocumento: 'DOC1',
    });
    expensesRepo.seedExpense({
      id: 'E3',
      politicianId: 'CPF001',
      cnpj: 'CNPJ1',
      numDocumento: 'DOC1',
    });

    const pipeline = new DuplicateInvoicePipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepo.getAllFlags();
    assert.strictEqual(flags.length, 3);
  });

  it('does not flag when the pair is split across two different politicians', async () => {
    politicianRepo.seedDeputy('CPF001');
    politicianRepo.seedDeputy('CPF002');
    expensesRepo.seedExpense({
      id: 'E1',
      politicianId: 'CPF001',
      cnpj: 'CNPJ1',
      numDocumento: 'DOC1',
    });
    expensesRepo.seedExpense({
      id: 'E2',
      politicianId: 'CPF002',
      cnpj: 'CNPJ1',
      numDocumento: 'DOC1',
    });

    const pipeline = new DuplicateInvoicePipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepo.getAllFlags();
    assert.strictEqual(flags.length, 0, 'Cross-politician reuse is not DUPLICATE_INVOICE');
  });

  it('does not flag distinct num_documento values for the same vendor/politician', async () => {
    politicianRepo.seedDeputy('CPF001');
    expensesRepo.seedExpense({
      id: 'E1',
      politicianId: 'CPF001',
      cnpj: 'CNPJ1',
      numDocumento: 'DOC1',
    });
    expensesRepo.seedExpense({
      id: 'E2',
      politicianId: 'CPF001',
      cnpj: 'CNPJ1',
      numDocumento: 'DOC2',
    });

    const pipeline = new DuplicateInvoicePipeline(db);
    await pipeline.execute();

    const flags = forensicFlagsRepo.getAllFlags();
    assert.strictEqual(flags.length, 0);
  });

  it('does not flag when there are no expenses', async () => {
    const pipeline = new DuplicateInvoicePipeline(db);
    await pipeline.execute();
    const flags = forensicFlagsRepo.getAllFlags();
    assert.strictEqual(flags.length, 0);
  });

  it('is idempotent', async () => {
    politicianRepo.seedDeputy('CPF001');
    expensesRepo.seedExpense({
      id: 'E1',
      politicianId: 'CPF001',
      cnpj: 'CNPJ1',
      numDocumento: 'DOC1',
    });
    expensesRepo.seedExpense({
      id: 'E2',
      politicianId: 'CPF001',
      cnpj: 'CNPJ1',
      numDocumento: 'DOC1',
    });

    const pipeline = new DuplicateInvoicePipeline(db);
    await pipeline.execute();
    await pipeline.execute();

    const flags = forensicFlagsRepo.getAllFlags();
    assert.strictEqual(flags.length, 2);
  });

  describe('S/N placeholder exclusion', () => {
    const snVariants = ['S/N', 'SN', 'S.N.', 'S/Nº', '00', '000', '0', '-', ''];

    for (const variant of snVariants) {
      it(`excludes num_documento = "${variant}"`, async () => {
        politicianRepo.seedDeputy('CPF001');
        expensesRepo.seedExpense({
          id: 'SN1',
          politicianId: 'CPF001',
          cnpj: 'CNPJ1',
          numDocumento: variant,
        });
        expensesRepo.seedExpense({
          id: 'SN2',
          politicianId: 'CPF001',
          cnpj: 'CNPJ1',
          numDocumento: variant,
        });

        const pipeline = new DuplicateInvoicePipeline(db);
        await pipeline.execute();

        const flags = forensicFlagsRepo.getAllFlags();
        assert.strictEqual(flags.length, 0);
      });
    }

    it('excludes lowercase and whitespace-padded variants', async () => {
      politicianRepo.seedDeputy('CPF001');
      expensesRepo.seedExpense({
        id: 'WS1',
        politicianId: 'CPF001',
        cnpj: 'CNPJ1',
        numDocumento: '  s/n  ',
      });
      expensesRepo.seedExpense({
        id: 'WS2',
        politicianId: 'CPF001',
        cnpj: 'CNPJ1',
        numDocumento: 's/n',
      });

      const pipeline = new DuplicateInvoicePipeline(db);
      await pipeline.execute();

      const flags = forensicFlagsRepo.getAllFlags();
      assert.strictEqual(flags.length, 0);
    });

    it('does flag a legitimate look-alike like "0001"', async () => {
      politicianRepo.seedDeputy('CPF001');
      expensesRepo.seedExpense({
        id: 'LG1',
        politicianId: 'CPF001',
        cnpj: 'CNPJ1',
        numDocumento: '0001',
      });
      expensesRepo.seedExpense({
        id: 'LG2',
        politicianId: 'CPF001',
        cnpj: 'CNPJ1',
        numDocumento: '0001',
      });

      const pipeline = new DuplicateInvoicePipeline(db);
      await pipeline.execute();

      const flags = forensicFlagsRepo.getAllFlags();
      assert.strictEqual(flags.length, 2);
    });
  });
});
