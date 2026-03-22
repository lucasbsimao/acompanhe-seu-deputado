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

### expenses

Configuration for deputy expenses fetching.

- **yearsToFetch**: Number of years to fetch expenses data for, counting backwards from the current year (default: 4)
