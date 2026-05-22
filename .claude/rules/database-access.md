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
