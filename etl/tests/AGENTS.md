# ETL Integration Tests

## Overview

This test suite provides comprehensive integration and unit tests for the ETL pipeline that fetches deputy data from the Brazilian Congress API.

## Test Philosophy

- **Integration Tests**: Mock only the external API using `nock` (WireMock equivalent for Node.js)
- **Unit Tests**: Test owned resources (HttpClient, JsonArrayStreamWriter, PaginationEngine) without mocking them
- **Real I/O**: Tests perform actual file operations and HTTP client interactions

## Running Tests

```bash
# Run all tests
npm test

# Build only
npm run build

# Run with verbose output
npm test -- --reporter=spec
```

## Test Dependencies

- **nock**: HTTP mocking library (WireMock equivalent for Node.js)
- **node:test**: Built-in Node.js test runner (no Jest/Mocha needed)
- **node:assert**: Built-in assertion library

## Test Output

Tests use temporary directories for output files to avoid cluttering the workspace:
- Integration tests: `/tmp/etl-integration-tests/`

Directories are automatically created before each test and cleaned up after.

## Coverage

All tests cover:
- Happy path scenarios
- Error handling and retries
- Edge cases (empty data, large batches)
- Concurrent operations (parallel page fetching)
- Real file I/O operations
- Actual HTTP client behavior

## Design Principles

1. **No mocking of owned code**: Only external APIs are mocked
2. **Real behavior testing**: Actual file operations, HTTP retries, and streaming
3. **Deterministic**: All tests use controlled inputs and outputs
4. **Fast execution**: ~9-10 seconds for full suite
5. **Clear assertions**: Each test validates specific behavior

## Maintenance

When modifying the ETL pipeline:
1. Update corresponding test cases
2. Ensure all tests still pass
3. Add new test cases for new features
4. Maintain the principle of only mocking external dependencies
