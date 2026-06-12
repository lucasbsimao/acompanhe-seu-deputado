---
paths:
  - 'etl/**/*.ts'
---

# Enum for API codes

## Numeric and string codes from external APIs must use an enum

Whenever an API field carries a finite set of coded values — numeric codes (e.g. `codTipoDocumento`), string labels used as discriminators, status codes — define a TypeScript enum in `etl/src/types/` and reference it everywhere that field appears.

**Never** type these fields as `number` or `string` in interfaces, repositories, or pipelines.

```typescript
// BAD — raw primitive hides what the value means
interface ExpenseRow {
  codTipoDocumento: number;
}

// GOOD — enum makes the domain explicit and self-documents all valid values
import { CodTipoDocumento } from '../types/CodTipoDocumento';

interface ExpenseRow {
  codTipoDocumento: CodTipoDocumento;
}
```

## Enum file conventions

- One enum per file, located at `etl/src/types/<EnumName>.ts`.
- Numeric enums: assign the exact integer the API returns as the member value.
- String enums: assign the exact string the API returns as the member value.
- Every member **must** have a JSDoc comment explaining:
  - What the value represents in the real world.
  - Any non-obvious context (e.g. which parliament, which country, historical quirk).
  - A `@see` link to the relevant API docs or transparency portal if one exists.

```typescript
/**
 * Brief description of the enum and where the values come from.
 * Note if the API has no reference endpoint and values were derived empirically.
 *
 * @see https://link-to-api-docs
 */
export enum CodTipoDocumento {
  /**
   * Nota Fiscal — paper fiscal invoice issued by a Brazilian vendor.
   */
  NOTA_FISCAL = 0,

  /**
   * Despesa do PARLASUL — expense for Mercosul Parliament sessions held in
   * Montevideo, Uruguay.
   *
   * @see https://www.parlamentomercosul.org
   */
  DESPESA_DO_PARLASUL = 3,
}
```

## Why

API codes are opaque without documentation. When values are typed as raw primitives, the only way to understand them is to explore the API or read unrelated research notes. Enums with JSDoc make the meaning visible at the call site, prevent invalid values from being assigned, and ensure the full set of known values is discoverable in one file.
