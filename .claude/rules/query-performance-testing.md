---
paths:
  - 'etl/src/repositories/**/*.ts'
  - 'etl/tests/**/*.query-plan.test.ts'
---

# Query Performance Testing

Every repository under `etl/src/repositories/` that contains multi-table JOIN queries **must** have a
companion `*.query-plan.test.ts` file under `etl/tests/` with two mandatory test suites — full-table
scans on join targets silently turn sub-second ETL queries into 10–30 s operations on production data.

## SQL constants must be exported

Repository methods must delegate their SQL to exported constants in a `*Queries.ts` file so the
query-plan test can run `EXPLAIN QUERY PLAN` on the exact string the production code uses.

```typescript
// ForensicFlagsQueries.ts
export const VENDOR_NO_EMPLOYEES_SQL = `
  SELECT e.id FROM expenses e
  JOIN vendors v ON e.cnpj_cpf_fornecedor = v.cnpj
  WHERE ...`;
```

The repository imports and uses the constant:

```typescript
import { VENDOR_NO_EMPLOYEES_SQL } from './ForensicFlagsQueries';
this.db.prepare(VENDOR_NO_EMPLOYEES_SQL).run(...);
```

## Mandatory test suites

### 1. No full table scan on join targets

Seed realistic volume, run `ANALYZE` so the planner has real statistics, then check
`EXPLAIN QUERY PLAN` for every exported SQL constant.

The rule: **join-target tables must not appear as a bare `SCAN <table>` without a `USING` qualifier.**
Scanning the driving table (e.g. `expenses`) is expected and intentionally not checked.

```typescript
describe('no full table scan on join targets', () => {
  it('join-target tables use indexes across all queries', () => {
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

    assertNoUnindexedJoinScan(explainPlan(VENDOR_NO_EMPLOYEES_SQL), 'insertVendorNoEmployees');
    // one call per exported SQL constant
  });
});
```

Update the regex in `assertNoUnindexedJoinScan` to include any joined table specific to your repository
(e.g. add `|emendas` if the repository joins that table).

### 2. Volume timing

Seed the same realistic volume, run every repository method, and assert each completes within `BUDGET_MS`.

```typescript
const BUDGET_MS = 1500;
const EXPENSE_COUNT = 5000;
const VENDOR_COUNT = 1000;

describe(`volume timing — ${EXPENSE_COUNT} expenses, ${VENDOR_COUNT} vendors`, () => {
  it(`all repository methods complete within ${BUDGET_MS}ms`, () => {
    const db = getDb().db;
    seedVolumeData(db);
    const repo = new MyRepository(db);

    const cases: Array<[string, () => void]> = [
      ['methodName', () => repo.methodName(...)],
    ];

    for (const [name, run] of cases) {
      const start = Date.now();
      run();
      const elapsed = Date.now() - start;
      assert.ok(elapsed < BUDGET_MS, `${name} took ${elapsed}ms — exceeded ${BUDGET_MS}ms`);
    }
  });
});
```

## Seed data requirements

`seedVolumeData` must insert enough rows for the planner to prefer indexes over full scans:

- **≥ 1 000 vendors** covering all `registration_status` / `company_size` variants used by the queries
- **≥ 5 000 expenses** fanning across the vendor set with varied `tipo_despesa` values
- **Partner and candidate rows** if the repository joins `vendor_partners` or `tse_candidates`
- Any `pipeline_runs` sentinel row that guards a `NOT EXISTS` or `WHERE` clause in the SQL

All inserts must use `INSERT OR IGNORE` and be wrapped in `db.transaction(...)()` for speed.

## Canonical reference

`@/home/lucassimao/me/projects/acompanhe-seu-deputado/etl/tests/forensics/ForensicFlagsRepository.query-plan.test.ts`
is the reference implementation. Mirror its structure for every new repository.
