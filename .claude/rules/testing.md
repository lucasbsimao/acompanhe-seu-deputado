---
paths:
  - "**/*.test.ts"
  - "**/tests/**/*.ts"
  - "**/test/**/*.ts"
---

# Testing conventions

## Database setup in integration tests

Always use the `useTestDatabase()` hook. Never create ad-hoc DB instances inline inside `it`/`test` blocks.

**ETL** (`etl/tests/db/setup.ts`):
```typescript
import { useTestDatabase } from './db/setup';

describe('MyPipeline Integration Tests', () => {
  const { getDb } = useTestDatabase();

  it('should do something', async () => {
    const db = getDb().db;
  });
});
```

**App** (`app/test/db/setup.ts`):
```typescript
import { useTestDatabase } from '../../db/setup';

describe('MyService Integration Tests', () => {
  const { getDb } = useTestDatabase();

  it('should do something', async () => {
    const db = getDb().db; // SQLiteDatabase adapter
  });
});
```

Why: creates the DB once per describe block and clears data between tests — isolation without re-running migrations on every test. Pragmas match production (`foreign_keys = ON`, `journal_mode = WAL`, `busy_timeout = 5000`).

## Teardown / clearData ordering

Delete child tables before parent tables to respect FK constraints:
- `politicians` before `parties` (politicians.party_id → parties.id)
- Never delete from `ufs` — it is pre-seeded by migrations and shared across tests

## Mocking

- Only mock external HTTP APIs (use `nock` in ETL, Jest mocks in app).
- Never mock owned code (repositories, services, pipelines).
