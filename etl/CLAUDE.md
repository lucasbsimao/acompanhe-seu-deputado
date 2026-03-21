# ETL Sub-project

## Overview

Fetches data from the Brazilian Congress API (`dadosabertos.camara.leg.br`) and populates the shared SQLite database used by the mobile app.

## Commands

```bash
npm test                        # build + run all tests
npm run build                   # TypeScript compile only
npm test -- --reporter=spec     # verbose output
```

## Test stack

- **node:test** — built-in Node.js test runner (no Jest/Mocha)
- **node:assert** — built-in assertion library
- **nock** — HTTP mocking (intercepts outbound requests)

## Pipeline architecture

Each pipeline extends `PaginationEngine` and implements:
- `buildUrl(page, pageSize)` — constructs the paginated API URL
- `decodePage(data)` — validates and extracts the `dados` array from the response
- `extractTotalCount(headers)` — reads `x-total-count` header; throws if missing
- `onPageFetched(items)` — persists a page of results via a repository
