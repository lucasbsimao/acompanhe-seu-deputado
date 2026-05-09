# Workflow rules

## Decision gate — before any edit

| Situation | Action |
|---|---|
| Single file, clear spec | Edit directly |
| ≥2 unrelated files or DB schema change | Write a plan first |
| Architectural change or multiple valid approaches | Plan mode before writing anything |
| Bug with unknown root cause | Reproduce → instrument → patch. No guessing. |

## After every multi-file change

Run the applicable test command and confirm it passes. Do not end the turn without a passing run.

| Sub-project | Command |
|---|---|
| ETL | `cd etl && npm test` |
| App | `npm test` (root) |

## New API integration sequence

1. `curl -s --max-time 30 '<endpoint>'` — fetch one page
2. Inspect the JSON/CSV shape and note field names
3. Then write the pipeline

Do not write pipeline code before observing an actual API response.

## Docs parity

When pipeline architecture changes → update `etl/AGENTS.md` in the same commit.

## Vertical-slice rule

When adding N pipelines or N tests: complete one fully (implement → test → passing) before writing the remaining N−1.

## Loop break-out

If the same tool call fails twice with the same error: stop, read the raw error message, form a hypothesis, then act. Do not retry a third time without new information.
