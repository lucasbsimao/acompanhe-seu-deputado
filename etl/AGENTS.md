# ETL Sub-project — Agent Guide

## Overview

Fetches data from Brazilian government APIs and populates the shared SQLite database (`seed.db`) used by the mobile app.

## Commands

```bash
npm test                        # build + run all tests
npm run build                   # TypeScript compile only
npm test -- --reporter=spec     # verbose output
```

## Test stack

- **node:test** — built-in Node.js test runner (NOT Jest/Mocha)
- **node:assert** — built-in assertion library (NOT `expect()`)
- **nock** — HTTP mocking (intercepts outbound requests)

## Pipeline patterns — probe before implementing

Not every pipeline uses the same pattern. Before creating one:

1. `ls src/pipelines/<domain>/` — see what exists in the target domain
2. Read one existing pipeline in that folder to match the style exactly

| Pattern | When | Example |
|---|---|---|
| Extends domain `BasePipeline` | Paginated REST API with `x-total-count` header | `PartiesPipeline`, `DeputiesPipeline` |
| Standalone class with `execute()` | File download + CSV/ZIP processing | `TSE2022ElectionResultsPipeline` |
| Any other shape | API-specific needs | Always match existing domain conventions first |

If the domain has a `BasePipeline.ts`, grep it for abstract method signatures before extending — signatures differ per domain; do not copy from another domain's base.

## Static dependencies — required on every pipeline

Every pipeline class must declare:

```typescript
static readonly dependencies: readonly string[] = [];
```

`PipelineOrchestrator` uses this for topological sort. Omitting it silently breaks execution order.

## Known API domains

| Domain folder | Base URL | Auth |
|---|---|---|
| `dados-abertos-camara` | `https://dadosabertos.camara.leg.br/api/v2` | None |
| `dados-abertos-senado` | `https://legis.senado.leg.br/dadosabertos` | None |
| `portal-da-transparencia` | `https://api.portaldatransparencia.gov.br/api-de-dados` | API key header |
| `tse-dados-abertos` | `https://cdn.tse.jus.br/estatistica/sead/odsele` | None (ZIP download) |

## Config

Read legislature IDs, page sizes, and timeouts from `src/config/defaults.json` — never hardcode them.

## Test authoring rules

- `node:test` only — no Jest imports
- `node:assert` only — no `expect()`
- **HTTP mocking with nock (REST):** `nock(baseUrl).get(path).reply(...)` → instantiate pipeline → `execute()` → assert `nock.isDone()`
- **File-download pipelines:** mock `FileDownloader` at the class level; check an existing test in the same domain for the pattern
- **Vertical-slice rule:** write one complete test (mock → execute → DB assert), run it, fix any failures, then add remaining cases
- `nock.cleanAll()` in `afterEach`; `useTestDatabase()` hook in `describe` — never create a DB inline in `it`

## Common failure modes

| Symptom | Cause | Fix |
|---|---|---|
| Pipeline throws on first page | `x-total-count` header missing from nock reply | Add `.reply(200, body, { 'x-total-count': '10' })` |
| Duplicate politicians across runs | Legislature IDs overlap across terms | Deduplicate by CPF or API ID in the persistence step |
| Test timeouts | nock intercept not matching request URL | Print the actual URL with a `console.log` before `nock`; compare exactly |
| `npm test` compile error | TypeScript strict mode: `noUnusedLocals`, `noUnusedParameters` | Remove unused vars before running tests |

## Verification

Run `npm test` after every pipeline change. Do not end the turn without a passing run.
