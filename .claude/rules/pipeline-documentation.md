---
paths:
  - 'etl/src/pipelines/**/*.ts'
---

# Pipeline documentation rules

## Class-level JSDoc — required on every pipeline

Every pipeline class **must** have a JSDoc block immediately above the `class` declaration covering:

- **Purpose** — one sentence on what the pipeline collects or computes.
- **Source** — the API, file, or upstream pipeline it reads from.
- **Key behaviour** — non-obvious logic (pagination strategy, deduplication, flag conditions, etc.).
- **Co-dependencies** — other pipelines it flags or joins against, named with `{@link ClassName}`.

Canonical example:

```typescript
/**
 * Forensic flag: CNPJ_INACTIVE_AT_EXPENSE
 *
 * Flags expenses where the vendor's CNPJ was already in an inactive registration
 * status at the time the expense document was issued.
 * Checked statuses: BAIXADA (closed), INAPTA (unfit/non-compliant), SUSPENSA (suspended).
 * The status must have been effective on or before the expense date.
 *
 * A vendor with a closed or suspended registration cannot legally issue invoices;
 * its presence in CEAP data strongly suggests ghost-company billing or
 * retroactive expense fabrication.
 *
 * Co-occurs with {@link ForensicFlag.CNPJ_MISSING_ESTABLISHMENT} when the
 * vendor is both inactive and absent from the Receita Federal establishment
 * records, and with {@link ForensicFlag.FRESHLY_REGISTERED_VENDOR} in
 * compound vendor lifecycle anomaly escalation.
 */
export class CnpjInactiveAtExpensePipeline {
```

## Inline comments on non-obvious logic — required

Any code that deviates from the obvious must have an inline comment explaining **why**, not just **what**. Required on:

- URL parameters whose absence would silently change result semantics.
- Deduplication or conflict-resolution strategies chosen over alternatives.

Canonical examples:

```typescript
// Plain /deputados only returns currently active deputies; filtering by idLegislatura
// includes everyone who ever held a seat in that term (ministers on leave, resignees, suplentes).
url.searchParams.set('idLegislatura', String(this.currentLegislaturaId));
```

## Do not document

Trivial getters, simple assignments, and self-explanatory CRUD calls must **not** get JSDoc — noise hides signal.
