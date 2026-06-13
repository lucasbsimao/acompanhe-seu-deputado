# Avoid Hardcoded Strings for Enums

## Context

The codebase uses TypeScript Enums for domain-specific values like `PoliticianRole`. Hardcoding these strings (e.g., `'SENATOR'`, `'DEPUTY'`) in queries or logic makes the code brittle and harder to refactor.

## Rule

- **NEVER** hardcode string values that have a corresponding TypeScript Enum defined.
- **ALWAYS** use the Enum value (e.g., `PoliticianRole.SENATOR`) instead of the literal string.
- In SQL queries, **ALWAYS** use parameter binding (`?`) for Enum values rather than template literals or string concatenation.
- This applies to:
  - SQL queries.
  - Business logic comparisons.
  - Configuration values.

## Examples

### Incorrect

```typescript
const query = db.prepare("SELECT * FROM politicians WHERE role = 'SENATOR'");
// OR
const query = db.prepare(`SELECT * FROM politicians WHERE role = '${PoliticianRole.SENATOR}'`);
```

### Correct

```typescript
import { PoliticianRole } from '../types/PoliticianRole';

const query = db.prepare('SELECT * FROM politicians WHERE role = ?');
query.get(PoliticianRole.SENATOR);
```
