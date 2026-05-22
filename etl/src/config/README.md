# Configuration

This directory contains default configuration values for the ETL pipeline.

## defaults.json

### pagination

Configuration for API pagination and retry behavior.

- **pageSize**: Number of items to fetch per page from the API (default: 100)
- **parallelism**: Number of parallel requests to make concurrently (default: 4)
- **maxRetries**: Maximum number of retry attempts for failed requests (default: 3)
- **retryWaitMin**: Minimum wait time in milliseconds before retrying a failed request (default: 250)
- **retryWaitMax**: Maximum wait time in milliseconds before retrying a failed request (default: 2000)
- **timeoutMs**: Request timeout in milliseconds (default: 30000)

### deputies

Configuration for deputy fetching.

- **legislaturasToFetch**: Number of most recent legislatures to fetch, counting backwards from the current one (default: 3). Each legislature covers a 4-year term. Fetching 3 terms covers roughly 12 years of history, including all deputies who ever served — titulars, ministers on leave, suplentes, and those who resigned.

### expenses

Configuration for deputy expenses fetching.

- **yearsToFetch**: Number of years to fetch expenses data for, counting backwards from the current year (default: 4)

---

<!-- TODO: unify all time-range configs (deputies.legislaturasToFetch, expenses.yearsToFetch,
     amendments.yearsToFetch) behind a single top-level "baseYear". Each section would then
     derive its own range from that anchor instead of using independent counters, making it
     trivial to replay the full pipeline from any desired year without touching multiple knobs. -->
