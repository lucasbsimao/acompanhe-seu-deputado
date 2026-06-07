# Database Access Rules

## Only Repositories Access Database Directly

**Never access the database directly in services, pipelines, or any other components.** All database operations must go through repository classes.

### Why this rule exists

- **Separation of concerns**: Services should focus on business logic, not data access
- **Testability**: Repositories can be easily mocked for unit tests
- **Maintainability**: Database queries are centralized in one place
- **Consistency**: Ensures all data access follows the same patterns

### Correct pattern

```typescript
// ✅ Any component uses repository
export class SomeService {
  constructor(private readonly repository: SomeRepository) {}

  doSomething(): void {
    const data = this.repository.getData();
    // business logic here
  }
}

export class SomePipeline {
  constructor(private readonly repository: SomeRepository) {}

  execute(): void {
    const data = this.repository.getData();
    // pipeline logic here
  }
}
```

### Incorrect pattern

```typescript
// ❌ Any component accesses database directly
export class SomeService {
  constructor(private readonly db: Database.Database) {}

  doSomething(): void {
    const data = this.db.prepare('SELECT * FROM table').all();
    // business logic here
  }
}

export class SomePipeline {
  constructor(private readonly db: Database.Database) {}

  execute(): void {
    const data = this.db.prepare('SELECT * FROM table').all();
    // pipeline logic here
  }
}
```

### Repository responsibilities

- Encapsulate all database queries
- Handle prepared statements and transactions
- Provide domain-specific data access methods
- Manage database connections and error handling

### Service responsibilities

- Orchestrate business logic
- Coordinate between multiple repositories
- Handle validation and transformation
- Implement use cases

This rule applies to ALL components except repositories:

- Services
- Pipelines
- Controllers
- Any other business logic components

Only repository classes should access the database directly.

## Test-only repositories

Integration tests must never call `db.prepare()` or `db.exec()` directly. Instead, use dedicated **test-only repository classes** located in `etl/tests/db/`:

| File                          | Purpose                                                 |
| ----------------------------- | ------------------------------------------------------- |
| `TestPoliticianRepository`    | Seed parties + politicians; export `makeCPF` helper     |
| `TestExpensesRepository`      | Seed expenses; `seedExpenseWithCnpj` convenience method |
| `TestVendorRepository`        | Seed vendors                                            |
| `TestForensicFlagsRepository` | Read `forensic_flags` for assertions                    |
| `TestEmendaRepository`        | Seed emendas parlamentares                              |

### Correct test pattern

```typescript
// ✅ Test uses test repository classes
it('flags expense when vendor postdates it', async () => {
  const db = getDb().db;
  new TestPoliticianRepository(db).seedDeputy('CPF001');
  new TestExpensesRepository(db).seedExpense({
    id: 'EXP-1',
    deputyId: 'CPF001',
    cnpj: '11222333000181',
    dataDocumento: '2023-06-01',
  });
  new TestVendorRepository(db).seedVendor('11222333000181', '2023-06-15');

  await new SomePipeline(db).execute();

  const flags = new TestForensicFlagsRepository(db).getAllFlags();
  assert.strictEqual(flags.length, 1);
});
```

### Incorrect test pattern

```typescript
// ❌ Test accesses database directly
it('flags expense when vendor postdates it', async () => {
  const db = getDb().db;
  db.prepare('INSERT OR IGNORE INTO parties ...').run(...);
  db.prepare('INSERT INTO expenses ...').run(...);

  await new SomePipeline(db).execute();

  const flags = db.prepare('SELECT * FROM forensic_flags').all();
});
```

When a new seeding need arises, **add a method to the appropriate test repository** rather than writing inline `db.prepare()` calls in the test body.
