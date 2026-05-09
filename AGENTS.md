# Acompanhe Seu Deputado — Agent Guide

## Structure

| Sub-project | Path | Stack |
|---|---|---|
| React Native mobile app | `app/` | React Native 0.81, Jest, better-sqlite3 (tests) |
| ETL pipeline | `etl/` | Node.js 20+, TypeScript, node:test, nock |
| Shared database | `seed.db` (root) | SQLite — written by ETL, read by app |

## Key commands

| Sub-project | Command | Effect |
|---|---|---|
| ETL | `npm test` (inside `etl/`) | Build TypeScript → run all tests |
| ETL | `npm run build` (inside `etl/`) | TypeScript compile only |
| ETL | `npm test -- --reporter=spec` | Verbose test output |
| App | `npm test` (root) | Run Jest suite |
| App | `npm run test:unit` | Unit tests only |
| App | `npm run test:integration` | Integration tests only |

For ETL-specific guidance see [`etl/AGENTS.md`](etl/AGENTS.md).

## Decision gate — plan vs. implement directly

| Task shape | Action |
|---|---|
| Single file, clear spec | Implement directly |
| ≥2 unrelated files OR DB schema change | Write a plan first |
| Architectural / multiple valid approaches | Plan before writing anything |
| New API integration | `curl -s --max-time 30 '<endpoint>'` → inspect shape → implement |
| Bug with unknown root cause | Reproduce → instrument → patch. No "patch and pray." |

## Before editing in `etl/`

1. `ls etl/src/pipelines/<domain>/` — see which pattern the domain uses
2. Read one existing pipeline in that folder to match the style; do not read the whole directory
3. Check `etl/src/config/defaults.json` for configurable values before hardcoding anything

## Test verification

After every change, run the applicable test command and confirm it passes before ending the turn. Do not end on "this should work."

## DB invariants

- Never `DELETE FROM ufs` — pre-seeded by migrations, shared across all tests
- Delete child tables before parents to respect FK constraints: `politicians` before `parties`
- Use `useTestDatabase()` hook — never create ad-hoc DB instances in `it`/`test` blocks

## Commit style

Conventional commits: `feat:`, `fix:`, `test:`, `refactor:`, `docs:`

## Multi-session tasks

Write progress to `PLAN.md` at the repo root; read it at session start. Do not rely on context compaction to preserve task state across sessions.
