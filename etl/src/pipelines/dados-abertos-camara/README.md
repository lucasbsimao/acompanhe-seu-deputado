# Retrieving All Deputies from the Câmara API

## The Problem

The default `/deputados` endpoint only returns deputies currently active in the chamber:

```bash
curl -X GET \
  'https://dadosabertos.camara.leg.br/api/v2/deputados?ordem=ASC&ordenarPor=nome' \
  -H 'accept: application/json'
```

This misses deputies who:
- Are on leave as ministers (`situacao: Licença`)
- Resigned or had their mandate revoked (`situacao: Vacância`)
- Are suplentes currently on standby (`situacao: Suplência`) — even though they physically served

## Key Finding

The `?idLegislatura=<n>` filter returns **everyone who ever held a seat** in that term — not just those currently sitting. This was verified with:

- **Enio Verri** (id `132504`) — resigned in March 2023 (`Vacância`), still returned by `?idLegislatura=57`
- **José Nobre Guimarães** (id `141470`) — currently serving as minister (`Licença`), still returned by `?idLegislatura=57`
- **Suplentes who served temporarily** — also included

Legislature 57 (2023–2027) returns **830 unique deputies**, well above the 513 seats, confirming all substitutes who ever served are included.

## Step 1 — Fetch All Legislatures

```bash
curl -X GET \
  'https://dadosabertos.camara.leg.br/api/v2/legislaturas?ordem=DESC&ordenarPor=id' \
  -H 'accept: application/json'
```

Returns legislature IDs from 43 (1967–1971) to 57 (2023–2027), each covering a 4-year term.

## Step 2 — Fetch All Deputies per Legislature (with pagination)

Replace `{idLegislatura}` and `{pagina}`:

```bash
curl -X GET \
  'https://dadosabertos.camara.leg.br/api/v2/deputados?idLegislatura={idLegislatura}&itens=100&ordem=ASC&ordenarPor=id&pagina={pagina}' \
  -H 'accept: application/json'
```

Check `links[rel=last]` in the response to know the total number of pages:

```json
{
  "links": [
    { "rel": "last", "href": "...&pagina=9&itens=100" }
  ]
}
```

### Example — all deputies of legislature 57, page 1:

```bash
curl -X GET \
  'https://dadosabertos.camara.leg.br/api/v2/deputados?idLegislatura=57&itens=100&ordem=ASC&ordenarPor=id&pagina=1' \
  -H 'accept: application/json'
```

## Step 3 — Fetch Individual Deputy Detail

The list endpoint returns limited fields. To get full data (CPF, birth date, education, etc.):

```bash
curl -X GET \
  'https://dadosabertos.camara.leg.br/api/v2/deputados/{id}' \
  -H 'accept: application/json'
```

The `ultimoStatus` field contains:
- `situacao` — current status: `Exercício`, `Licença`, `Vacância`, `Suplência`, `Convocado`
- `condicaoEleitoral` — `Titular` (elected) or `Suplente` (substitute)
- `idLegislatura` — the legislature this status belongs to

## Step 4 — Fetch Deputy History (optional)

To see every status change a deputy went through across all terms:

```bash
curl -X GET \
  'https://dadosabertos.camara.leg.br/api/v2/deputados/{id}/historico' \
  -H 'accept: application/json'
```

## Complete Strategy

```
1. GET /legislaturas                          → collect IDs 43–57
2. for each legislature ID:
     paginate GET /deputados?idLegislatura=N  → collect all deputy IDs
3. deduplicate by deputy ID                   → same person keeps ID across terms
4. GET /deputados/{id}                        → enrich with full details
```

### Why deduplication is needed

A deputy who serves across multiple terms keeps the same numeric ID. Iterating all legislatures without deduplication would yield the same person multiple times.

### Why brute-forcing the ID range does not work

IDs are not consecutive integers. The gaps between known IDs are empty (return HTTP 404). There is no pattern to derive unknown IDs — the `?idLegislatura` approach is the only reliable method.
