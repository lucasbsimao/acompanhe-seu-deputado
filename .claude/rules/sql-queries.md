---
paths:
  - "etl/src/repositories/**/*.ts"
---

# SQL Query Rules

## No template literal interpolation in SQL strings

**Never** use `${}` to embed values or build SQL structure. Every value must be a bound parameter (`?`).

```typescript
// ❌ interpolation — SQL injection surface, unformattable
const params = ids.map(() => '?').join(', ');
this.db.prepare(`SELECT * FROM expenses WHERE id IN (${params})`).all(...ids);

const score = SCORES[flag];
this.db.prepare(`INSERT INTO flags (score) VALUES (${score})`).run();

// ✅ bound parameters only
const snJson = JSON.stringify(ids);
this.db.prepare(`SELECT * FROM expenses WHERE id IN (SELECT value FROM json_each(?))`).all(snJson);

this.db.prepare(`INSERT INTO flags (score) VALUES (?)`).run(score);
```

## Variable-length IN lists → json_each

SQLite does not support array binding. Use `json_each(?)` with a JSON string instead of building `?,?,?` strings.

```typescript
// ❌
const placeholders = values.map(() => '?').join(', ');
stmt = db.prepare(`SELECT * FROM t WHERE col IN (${placeholders})`);
stmt.all(...values);

// ✅
const json = JSON.stringify(values);
stmt = db.prepare(`SELECT * FROM t WHERE col IN (SELECT value FROM json_each(?))`);
stmt.all(json);
```

When the column is normalised with `UPPER`/`TRIM`, pre-normalise the array values in TypeScript so the `json_each` subselect stays simple:

```typescript
const json = JSON.stringify(values.map(v => v.trim().toUpperCase()));
// SQL: WHERE TRIM(UPPER(col)) NOT IN (SELECT value FROM json_each(?))
```

## SQL strings must be static

A `db.prepare(...)` call must receive a string literal with no `${}` expressions.
Dynamic structure (e.g. different table names, optional clauses) must use separate `prepare` calls or conditional branching — never string concatenation or interpolation.

## Formatting

SQL keywords uppercase, one clause per line, subqueries indented two spaces relative to the parent clause:

```sql
INSERT OR REPLACE INTO forensic_flags (source_table, entity_id, flag_name, score, metadata)
SELECT
  'expenses' AS source_table,
  e.id AS entity_id,
  ? AS flag_name,
  ? AS score,
  NULL AS metadata
FROM expenses e
WHERE TRIM(UPPER(e.num_documento)) NOT IN (SELECT value FROM json_each(?))
  AND e.cnpj_cpf_fornecedor != ''
  AND (e.cnpj_cpf_fornecedor, e.num_documento) IN (
    SELECT cnpj_cpf_fornecedor, num_documento
    FROM expenses
    WHERE TRIM(UPPER(num_documento)) NOT IN (SELECT value FROM json_each(?))
      AND cnpj_cpf_fornecedor != ''
    GROUP BY cnpj_cpf_fornecedor, num_documento
    HAVING COUNT(DISTINCT deputy_id) >= 2
  )
```

Do not pad column aliases with extra spaces for alignment (e.g. `'expenses'      AS source_table` is wrong).
