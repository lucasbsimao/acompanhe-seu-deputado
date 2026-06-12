// SPDX-License-Identifier: AGPL-3.0-or-later

import * as assert from 'node:assert';
import { describe, it } from 'node:test';
import type Database from 'better-sqlite3';
import { useTestDatabase } from '../db/setup';
import { ForensicFlagsRepository } from '../../src/repositories/ForensicFlagsRepository';
import { ForensicFlag } from '../../src/pipelines/forensics/ForensicFlag';
import { CompanySize } from '../../src/types/CompanySize';
import {
  CROSS_DEPUTY_INVOICE_REUSE_SQL,
  CNPJ_POSTDATES_EXPENSE_SQL,
  CNPJ_INACTIVE_AT_EXPENSE_SQL,
  CNPJ_MISSING_ESTABLISHMENT_SQL,
  VENDOR_CNAE_MISMATCH_SQL,
  FRESHLY_REGISTERED_VENDOR_SQL,
  VENDOR_NO_EMPLOYEES_SQL,
  POLITICALLY_CONNECTED_VENDOR_SQL,
} from '../../src/repositories/ForensicFlagsQueries';

const BUDGET_MS = 1500;
const EXPENSE_COUNT = 5000;
const VENDOR_COUNT = 1000;

const EXPENSE_TYPES = [
  'MANUTENCAO DE ESCRITORIO',
  'LOCACAO OU FRETAMENTO DE VEICULOS',
  'SERVICO DE SEGURANCA',
  'PASSAGENS AEREAS',
] as const;

const INACTIVE_STATUSES = ['BAIXADA', 'INAPTA'] as const;

function seedVolumeData(db: Database.Database): void {
  db.prepare("INSERT OR IGNORE INTO parties (id, name, acronym) VALUES ('pt', 'PT', 'PT')").run();
  db.prepare(
    `INSERT OR IGNORE INTO politicians (cpf, source_api_id, name, uf, party_id, role, photo_url, elected_as)
       VALUES ('DEPUTY001', 'DEPUTY001', 'Deputy Test', 'SP', 'pt', 'DEPUTY', NULL, 'ELEITO_POR_QP')`,
  ).run();

  const insertVendor = db.prepare(
    `INSERT OR IGNORE INTO vendors
       (cnpj, legal_name, opening_date, registration_status, registration_status_date, company_size, employee_count)
     VALUES (?, 'Vendor LTDA', '2020-01-01', 'BAIXADA', '2021-06-01', ?, 0)`,
  );
  db.transaction(() => {
    for (let i = 1; i <= VENDOR_COUNT; i++) {
      insertVendor.run(String(i).padStart(14, '0'), CompanySize.MICRO_EMPRESA);
    }
  })();

  const insertExpense = db.prepare(
    `INSERT OR IGNORE INTO expenses
       (id, deputy_id, tipo_despesa, cod_documento, cod_tipo_documento,
        data_documento, num_documento, nome_fornecedor, cnpj_cpf_fornecedor, valor_liquido, valor_glosa)
     VALUES (?, 'DEPUTY001', ?, ?, 0, '2023-06-01', ?, 'Vendor', ?, 10000, 0)`,
  );
  db.transaction(() => {
    for (let i = 1; i <= EXPENSE_COUNT; i++) {
      const cnpj = String((i % VENDOR_COUNT) + 1).padStart(14, '0');
      const tipo = EXPENSE_TYPES[i % EXPENSE_TYPES.length];
      insertExpense.run(`EXP-${i}`, tipo, `COD-${i}`, `NF-${i}`, cnpj);
    }
  })();

  const insertPartner = db.prepare(
    'INSERT OR IGNORE INTO vendor_partners (cnpj, partner_cpf_cnpj, partner_name) VALUES (?, ?, ?)',
  );
  const insertCandidate = db.prepare(
    `INSERT OR IGNORE INTO tse_candidates (cpf, nome, cargo, partido, ano_eleicao, uf)
     VALUES (?, ?, 'DEPUTADO', 'PT', '2022', 'SP')`,
  );
  db.transaction(() => {
    for (let i = 1; i <= 100; i++) {
      const cnpj = String(i).padStart(14, '0');
      const cpf = String(i).padStart(11, '0');
      insertPartner.run(cnpj, cpf, `Partner ${i}`);
      if (i <= 50) {
        insertCandidate.run(cpf, `Candidate ${i}`);
      }
    }
  })();

  db.prepare(
    "INSERT OR IGNORE INTO pipeline_runs (pipeline_name, completed_at, row_count) VALUES (?, datetime('now'), 0)",
  ).run('ReceitaFederalCNPJPipeline');
}

describe('ForensicFlagsRepository — query plan', () => {
  const { getDb } = useTestDatabase();

  describe('no full table scan on join targets', () => {
    it('join-target tables use indexes across all forensic queries', () => {
      const db = getDb().db;
      seedVolumeData(db);
      db.exec('ANALYZE');

      type PlanRow = { id: number; parent: number; notused: number; detail: string };

      function explainPlan(sql: string): PlanRow[] {
        const paramCount = (sql.match(/\?/g) ?? []).length;
        const dummies = Array.from({ length: paramCount }, () => null);
        return db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...dummies) as PlanRow[];
      }

      function assertNoUnindexedJoinScan(plan: PlanRow[], label: string): void {
        const badScans = plan.filter(
          row =>
            /SCAN (vendors|vendor_partners|tse_candidates)\b/.test(row.detail) &&
            !/USING/.test(row.detail),
        );
        assert.deepStrictEqual(
          badScans.map(r => r.detail),
          [],
          `${label}: unindexed full scan on join target — ${JSON.stringify(plan.map(r => r.detail))}`,
        );
      }

      assertNoUnindexedJoinScan(
        explainPlan(CROSS_DEPUTY_INVOICE_REUSE_SQL),
        'insertCrossDeputyInvoiceReuse',
      );
      assertNoUnindexedJoinScan(
        explainPlan(CNPJ_POSTDATES_EXPENSE_SQL),
        'insertCnpjPostdatesExpense',
      );
      assertNoUnindexedJoinScan(
        explainPlan(CNPJ_INACTIVE_AT_EXPENSE_SQL),
        'insertCnpjInactiveAtExpense',
      );
      assertNoUnindexedJoinScan(
        explainPlan(CNPJ_MISSING_ESTABLISHMENT_SQL),
        'insertCnpjMissingEstablishment',
      );
      assertNoUnindexedJoinScan(explainPlan(VENDOR_CNAE_MISMATCH_SQL), 'insertVendorCnaeMismatch');
      assertNoUnindexedJoinScan(
        explainPlan(FRESHLY_REGISTERED_VENDOR_SQL),
        'insertFreshlyRegisteredVendor',
      );
      assertNoUnindexedJoinScan(explainPlan(VENDOR_NO_EMPLOYEES_SQL), 'insertVendorNoEmployees');
      assertNoUnindexedJoinScan(
        explainPlan(POLITICALLY_CONNECTED_VENDOR_SQL),
        'insertPoliticallyConnectedVendor',
      );
    });
  });

  describe(`volume timing — ${EXPENSE_COUNT} expenses, ${VENDOR_COUNT} vendors`, () => {
    it(`all repository methods complete within ${BUDGET_MS}ms`, () => {
      const db = getDb().db;
      seedVolumeData(db);
      const repo = new ForensicFlagsRepository(db);

      const cases: Array<[string, () => void]> = [
        [
          'insertCrossDeputyInvoiceReuse',
          () => repo.insertCrossDeputyInvoiceReuse(ForensicFlag.CROSS_DEPUTY_INVOICE_REUSE, []),
        ],
        [
          'insertCnpjPostdatesExpense',
          () => repo.insertCnpjPostdatesExpense(ForensicFlag.CNPJ_POSTDATES_EXPENSE),
        ],
        [
          'insertCnpjInactiveAtExpense',
          () =>
            repo.insertCnpjInactiveAtExpense(
              ForensicFlag.CNPJ_INACTIVE_AT_EXPENSE,
              INACTIVE_STATUSES,
            ),
        ],
        [
          'insertCnpjMissingEstablishment',
          () =>
            repo.insertCnpjMissingEstablishment(
              ForensicFlag.CNPJ_MISSING_ESTABLISHMENT,
              'ReceitaFederalCNPJPipeline',
            ),
        ],
        [
          'insertVendorCnaeMismatch',
          () =>
            repo.insertVendorCnaeMismatch(ForensicFlag.VENDOR_CNAE_MISMATCH, [
              'MANUTENCAO DE ESCRITORIO',
              'LOCACAO OU FRETAMENTO DE VEICULOS',
              'SERVICO DE SEGURANCA',
            ]),
        ],
        [
          'insertFreshlyRegisteredVendor',
          () => repo.insertFreshlyRegisteredVendor(ForensicFlag.FRESHLY_REGISTERED_VENDOR),
        ],
        [
          'insertVendorNoEmployees',
          () =>
            repo.insertVendorNoEmployees(ForensicFlag.VENDOR_NO_EMPLOYEES, [
              'MANUTENCAO DE ESCRITORIO',
              'LOCACAO OU FRETAMENTO DE VEICULOS',
              'SERVICO DE SEGURANCA',
            ]),
        ],
        [
          'insertPoliticallyConnectedVendor',
          () => repo.insertPoliticallyConnectedVendor(ForensicFlag.POLITICALLY_CONNECTED_VENDOR),
        ],
      ];

      for (const [name, run] of cases) {
        const start = Date.now();
        run();
        const elapsed = Date.now() - start;
        assert.ok(elapsed < BUDGET_MS, `${name} took ${elapsed}ms — exceeded ${BUDGET_MS}ms`);
      }
    });
  });
});
