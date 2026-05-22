---
paths:
  - "etl/**/*.ts"
  - "etl/tests/**"
---

# ETL pipeline rules

## Before creating a new pipeline

Run `ls etl/src/pipelines/<domain>/` → read one existing pipeline in that folder to match the pattern. Do not assume all pipelines extend `BasePipeline` — the pattern varies by domain and API type.

## Static dependencies — required

Every pipeline class must declare `static readonly dependencies: readonly string[] = []`. Omitting it silently breaks `PipelineOrchestrator` topological sort.

## Test runner

Use `node:test` and `node:assert`. Do not import `jest`, `expect`, or any Jest utility — `etl/` does not run Jest.

## nock setup order for REST pipelines

```
nock(baseUrl).get(path).reply(statusCode, body, headers)
→ instantiate pipeline
→ call execute()
→ assert nock.isDone()
```

Include `'x-total-count'` in headers for paginated endpoints or the pipeline will throw.

## Config values

Read legislature IDs, page sizes, and timeouts from `src/config/defaults.json`. Do not hardcode them.

## Verification gate

Run `npm test` (inside `etl/`) before ending the turn. Do not end on "should work."
