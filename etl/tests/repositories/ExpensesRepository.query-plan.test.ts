// SPDX-License-Identifier: AGPL-3.0-or-later

import * as assert from 'node:assert';
import { describe, it } from 'node:test';
import type Database from 'better-sqlite3';
import { useTestDatabase } from '../db/setup';
import { ExpensesRepository } from '../../src/repositories/ExpensesRepository';
import { TestExpensesRepository, TestExpenseSeed } from '../db/TestExpensesRepository';
import { TestPoliticianRepository, TestPoliticianSeed } from '../db/TestPoliticianRepository';
import { PoliticianRole } from '../../src/types/PoliticianRole';
import {
  COUNT_BY_POLITICIAN_SQL,
  FIND_BY_COMPOSITE_KEY_SQL,
  GET_ALL_URL_WORK_QUEUE_SQL,
  GET_DISTINCT_CNPJS_SQL,
  GET_NULL_URL_WORK_QUEUE_SQL,
  HAS_EXPENSES_FOR_SENATOR_YEAR_SQL,
  HAS_EXPENSES_SQL,
  INSERT_EXPENSE_SQL,
  UPDATE_URL_SQL,
} from '../../src/repositories/ExpensesRepositoryQueries';

const BUDGET_MS = 1500;
const EXPENSE_COUNT = 5000;
const VENDOR_COUNT = 1000;

function seedVolumeData(db: Database.Database): void {
  const politicianRepo = new TestPoliticianRepository(db);
  const politicianSeeds: TestPoliticianSeed[] = [];
  for (let i = 1; i <= 10; i++) {
    politicianSeeds.push({
      cpf: `CPF${String(i).padStart(8, '0')}`,
      sourceApiId: `ID${i}`,
      name: `Politician ${i}`,
      role: PoliticianRole.SENATOR,
    });
  }
  politicianRepo.seedBatch(politicianSeeds);

  const testRepo = new TestExpensesRepository(db);
  const seeds: TestExpenseSeed[] = [];
  for (let i = 1; i <= EXPENSE_COUNT; i++) {
    const polIdx = (i % 10) + 1;
    const cpf = `CPF${String(polIdx).padStart(8, '0')}`;
    const cnpj = String((i % VENDOR_COUNT) + 1).padStart(14, '0');
    const date = `2023-${String((i % 12) + 1).padStart(2, '0')}-01`;
    seeds.push({
      id: `EXP-${i}`,
      politicianId: cpf,
      cnpj,
      dataDocumento: date,
      numDocumento: `NF-${i}`,
    });
  }
  testRepo.seedBatch(seeds);
}

describe('ExpensesRepository — query plan', () => {
  const { getDb } = useTestDatabase();

  describe('no full table scan on join targets', () => {
    it('join-target tables use indexes across all expenses queries', () => {
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
        // We join politicians in some queries. Scanning the driving table 'expenses' is allowed.
        const badScans = plan.filter(
          row => /SCAN (politicians)\b/.test(row.detail) && !/USING/.test(row.detail),
        );
        assert.deepStrictEqual(
          badScans.map(r => r.detail),
          [],
          `${label}: unindexed full scan on join target — ${JSON.stringify(plan.map(r => r.detail))}`,
        );
      }

      assertNoUnindexedJoinScan(explainPlan(INSERT_EXPENSE_SQL), 'INSERT_EXPENSE_SQL');
      assertNoUnindexedJoinScan(explainPlan(HAS_EXPENSES_SQL), 'HAS_EXPENSES_SQL');
      assertNoUnindexedJoinScan(
        explainPlan(HAS_EXPENSES_FOR_SENATOR_YEAR_SQL),
        'HAS_EXPENSES_FOR_SENATOR_YEAR_SQL',
      );
      assertNoUnindexedJoinScan(explainPlan(COUNT_BY_POLITICIAN_SQL), 'COUNT_BY_POLITICIAN_SQL');
      assertNoUnindexedJoinScan(
        explainPlan(GET_NULL_URL_WORK_QUEUE_SQL),
        'GET_NULL_URL_WORK_QUEUE_SQL',
      );
      assertNoUnindexedJoinScan(
        explainPlan(GET_ALL_URL_WORK_QUEUE_SQL),
        'GET_ALL_URL_WORK_QUEUE_SQL',
      );
      assertNoUnindexedJoinScan(
        explainPlan(FIND_BY_COMPOSITE_KEY_SQL),
        'FIND_BY_COMPOSITE_KEY_SQL',
      );
      assertNoUnindexedJoinScan(explainPlan(UPDATE_URL_SQL), 'UPDATE_URL_SQL');
      assertNoUnindexedJoinScan(explainPlan(GET_DISTINCT_CNPJS_SQL), 'GET_DISTINCT_CNPJS_SQL');
    });
  });

  describe(`volume timing — ${EXPENSE_COUNT} expenses`, () => {
    it(`all repository methods complete within ${BUDGET_MS}ms`, () => {
      const db = getDb().db;
      seedVolumeData(db);
      const repo = new ExpensesRepository(db);

      const cases: Array<[string, () => void]> = [
        ['hasExpensesForPolitician', () => repo.hasExpensesForPolitician('CPF00000001')],
        ['hasExpensesForSenatorYear', () => repo.hasExpensesForSenatorYear(2023)],
        ['countByPolitician', () => repo.countByPolitician('CPF00000001')],
        ['getDistinctCnpjs', () => repo.getDistinctCnpjs()],
        ['getCeapsWorkQueue', () => repo.getCeapsWorkQueue()],
        [
          'findExpenseIdByCompositeKey',
          () =>
            repo.findExpenseIdByCompositeKey('CPF00000001', '00000000000001', '2023-01-01', 10000),
        ],
        ['updateUrlDocumento', () => repo.updateUrlDocumento('EXP-1', 'http://test.com')],
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
