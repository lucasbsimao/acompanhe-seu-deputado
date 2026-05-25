---
paths:
  - "etl/**/*.ts"
---

# HTTP resilience rules

## Every HTTP request must use retry with exponential back-off

Raw `axios` / `axios.create()` is forbidden. All outbound HTTP requests must go through `HttpClient` (`etl/src/core/HttpClient.ts`).

## Known violation — FileDownloader

`FileDownloader.downloadFile` calls raw `axios({ responseType: 'stream' })`. Fix: add a `requestStream` method to `HttpClient` and delegate to it. File I/O (`createWriteStream`, `pipeline`) stays in `FileDownloader`.

```typescript
// BAD
const response = await axios({ method: 'GET', url, responseType: 'stream' });

// GOOD
const response = await this.httpClient.requestStream(url, { auth });
```

## Constructor injection

Pipelines and utilities that make HTTP calls must accept `HttpClient` (or `FileDownloader`) via constructor injection.

```typescript
class MyPipeline {
  constructor(private readonly http: HttpClient) {}
}
```
