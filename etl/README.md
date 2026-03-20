# API Data Retrieval - TypeScript ETL

A TypeScript-based ETL (Extract, Transform, Load) system for retrieving Brazilian Congress deputy data from the official API with parallel processing, retry logic, and memory-efficient JSON streaming.

## Features

- **Object-Oriented Design**: All functionality encapsulated in well-structured classes
- **Parallel Processing**: Configurable worker pool for concurrent page fetching
- **Retry Logic**: Exponential backoff with configurable retry attempts
- **Memory Efficient**: Streams JSON output to avoid loading entire dataset in memory
- **Type Safe**: Full TypeScript with strict type checking
- **Timeout Support**: Global timeout with AbortController for cancellation

## Architecture

### Core Classes

- **`HttpClient`**: Handles HTTP requests with automatic retry logic and backoff strategies
- **`JsonArrayStreamWriter<T>`**: Memory-efficient streaming JSON array writer
- **`PaginationEngine<T>`**: Generic parallel pagination orchestrator
- **`DeputiesETL`**: Deputy-specific ETL implementation

### Project Structure

```
src/
├── core/
│   ├── HttpClient.ts              # HTTP client with retry logic
│   ├── JsonArrayStreamWriter.ts   # Streaming JSON writer
│   ├── PaginationConfig.ts        # Configuration interfaces
│   └── PaginationEngine.ts        # Generic pagination engine
├── etl/
│   └── DeputiesETL.ts             # Deputy-specific ETL
└── main.ts                         # Application entry point
```

## Installation

```bash
npm install
```

## Usage

### Build

```bash
npm run build
```

### Run

```bash
npm start
```

### Development

```bash
npm run dev
```

## Configuration

The ETL is configured in `DeputiesETL.ts`:

- **API Endpoint**: `https://dadosabertos.camara.leg.br/api/v2/deputados`
- **Page Size**: 100 records per page
- **Workers**: 5 concurrent workers
- **Max Retries**: 3 attempts per request
- **Retry Backoff**: 250ms to 2s exponential backoff
- **Global Timeout**: 30 seconds
- **Output File**: `deputies.json`

## Output

The script generates a `deputies.json` file containing a JSON array of deputy records with the following structure:

```json
[
  {
    "id": 204379,
    "nome": "Deputy Name",
    "siglaPartido": "PARTY",
    "siglaUf": "STATE",
    "urlFoto": "https://..."
  },
  ...
]
```

## Error Handling

- Network errors trigger automatic retries with exponential backoff
- HTTP 429 (Too Many Requests) and 5xx errors are retried
- Timeout errors are retried up to the configured limit
- Global timeout (30s) aborts the entire operation if exceeded

## Dependencies

- **axios**: HTTP client library
- **TypeScript**: Type-safe JavaScript
- **ts-node**: TypeScript execution for development

## Notes

- All functions are encapsulated within classes (no hanging functions)
- Proper resource cleanup with try-finally blocks
- Strict TypeScript configuration for type safety
- Follows Node.js best practices for async/await and error handling
