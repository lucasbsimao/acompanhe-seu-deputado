# ETL Development Backlog — Forensic Scoring Pipeline

> Ordered by forensic analyst + statistical priority. Scoring recalibration is intentionally last — run once after all indicator data is in place.
>
> Signal strength tiers: **Definitive** = zero/near-zero FPR, auto-escalate; **High** = strong discriminator, rarely fires benign; **Medium** = context-dependent, best combined; **Low** = contributes only in aggregate.

---

## Tier 1 — CEAP Schema Gaps + Flag Fixes

### 1. Fix `EXTREME_AMOUNT` guardrails

- **Type**: Recalibration of existing flag logic
- Current behavior uses a global 3× median, which is miscalibrated for high-variance categories
  - TAXI: 3× global median = R$63, below Q3 — flags 15% of taxi expenses including any airport ride
  - MANUTENCAO: 25.9% flagged due to geographic rent variance (min R$102 → max R$19,499 per deputy)
  - SEGURANCA: bimodal distribution — monthly contracts vs individual bookings; 39.7% flagged
- Required changes:
  - Use **per-politician median** for same `tipo_despesa` (not global median)
  - Minimum **5 prior expenses** per politician per category before using per-politician median; fall back to global P75 if below threshold
  - Use **5× multiplier** (instead of 3×) for: TAXI, MANUTENCAO DE ESCRITORIO, DIVULGACAO DA ATIVIDADE PARLAMENTAR, SERVICO DE SEGURANCA

---

## Tier 2 — PDF / OCR Infrastructure + Derived Flags

### 2. Handle `cod_tipo_documento = 4` HTML URLs

- **Type**: Architectural prerequisite — must be done before any PDF pipeline work
- `cod_tipo_documento = 4` links to `nota-fiscal-eletronica?ideDocumentoFiscal=XXXXXX` — an HTML page, not a PDF
- The pipeline must detect this pattern and skip PDF download/parse for these records
- Affects 210,212 expenses (31.6% of corpus) — without this fix any PDF pipeline fails on nearly a third of records

### 3. PDF extraction pipeline (pdf-parse + OCR fallback)

- **Type**: Core infrastructure — prerequisite for items #4, #5, #6
- **Depends on**: #2
- For `cod_tipo_documento ∈ {0, 1, 2, 3}` only
- **OCR is the primary path for `cod = 1`** (Recibos) — do not wait for pdf-parse to fail before invoking OCR; 81% of Recibos are image-based
- For `cod = 0` and others: pdf-parse first, OCR as fallback
- `ghostscript` and `imagemagick` are hard requirements, not optional
- PDF producer/creator tag (readable without decompression) enables smart routing: iText, PDFsharp, PDFium → text-extractable; HP Scan, iOS, Skia → skip pdf-parse entirely

### 4. `CATEGORY_MISMATCH`

- **Signal**: High — 35 pt
- **Depends on**: #3
- Apply unambiguous keyword table from §3.8 only (fuel, hotel, airline, food, postal keywords)
- **Require extracted text ≥ 100 chars** before applying keyword matching (OCR-sourced text with < 100 chars has too many typos and encoding errors to be reliable)
- ALUGUEL/CONDOMINIO keywords deliberately excluded — too many legitimate MANUTENCAO documents use these
- Coverage: ~16% of expenses have extractable text; low coverage but near-zero FPR on unambiguous hits

### 5. PASSENGER_NAME_MISMATCH + FAMILY_PASSENGER sub-flag

- **Signal**: High — 35 pt; Definitive/auto-escalate on `FAMILY_PASSENGER` (+15 pt)
- **Depends on**: #3
- Extend OCR pass for `tipo_despesa ∈ {PASSAGEM AEREA SIGEPA, PASSAGEM AEREA RPA}`
- Target label patterns: `"Passageiro:"`, `"Passenger:"`, `"Nome do Passageiro:"`
- Name comparison: NFD Unicode normalization + case-folding + token-overlap matching (handles middle-name reordering); a match on the last token of the deputy's name appearing anywhere in the extracted passenger name is sufficient
- `FAMILY_PASSENGER` sub-flag: mismatched passenger surname-matches the deputy's surname → escalate unconditionally
  - Apply same NFD normalization, last-name-token extraction, and 5% corpus frequency gate as `VENDOR_FAMILY_MEMBER` (item #9)
- Coverage: ~19–25% of PASSAGEM AEREA expenses (GOL/LATAM/AZUL e-tickets are frequently PDFium — text-extractable)

### 6. Cash payment detection (`CASH_PAYMENT`)

- **Signal**: Medium — +15 pt additive (not standalone)
- **Depends on**: #3
- OCR on `cod_tipo_documento = 1` only
- Target strings: `"em espécie"`, `"pagamento em dinheiro"`, `"pago em espécie"`
- Absent signal does NOT disprove cash payment — ~81% of Recibos are unextractable; do not use absence as exculpatory evidence

---

## Tier 3 — Geographic Enrichment

### 7. Add IBGE municipality code to `vendors`

- **Type**: Schema + enrichment — prerequisite for item #8
- New migration: `municipio_ibge_code TEXT` column on `vendors`
- RF Estabelecimentos `MUNICIPIO` column is already a numeric IBGE code — map to IBGE urban/rural classification table
- Standalone UF mismatch has 22–83% FPR by category (airlines, telecoms, ride-hailing are structurally registered in SP/RJ)

### 8. `VENDOR_GEOGRAPHIC_ANOMALY` (rural municipality precision)

- **Signal**: Medium — 20 pt
- **Depends on**: #7 (IBGE municipality codes)
- Flag: vendor registered in an IBGE-classified rural municipality while `tipo_despesa ∈ {MANUTENCAO DE ESCRITORIO, LOCACAO OU FRETAMENTO DE VEICULOS, SERVICO DE SEGURANCA}`
- Rural municipality dimension is far more discriminating than UF mismatch alone — a cattle-farming municipality cannot plausibly sublet urban office space
- Contributes to the §6 composite escalation rule alongside `RECIBO_DOCUMENT` and `POLITICALLY_CONNECTED_VENDOR` (now removed, see §6 for composite logic)

---

## Tier 4 — Remaining Signal Enrichments

### 9. `VENDOR_FAMILY_MEMBER`

- **Signal**: Low — 15 pt (meaningful only in combination)
- **Data**: `politicians.name` + `vendor_partners.partner_name`
- Implementation specifics:
  1. Apply NFD Unicode normalization and extract only the **last name token** before matching
  2. Check is **bilateral in direction**: does a token from the deputy's surname appear as a token in the partner name (not vice versa)
  3. Enforce 5% corpus frequency gate: suppress flag for any surname whose match rate across all `vendor_partners` records exceeds 5%
  4. Corpus confirmation of noisiest surnames to gate: PEREIRA (40 partner matches), OLIVEIRA (35), SILVA (20)

### 10. ANP fuel price pipeline

- **Type**: New pipeline — blocker for item #11
- **Source**: ANP weekly pump price historical series (`dados.gov.br/dados/conjuntos-dados/serie-historica-de-precos-de-combustiveis-por-revenda`)
- Creates table: `anp_fuel_prices(uf TEXT, semana_inicio TEXT, produto TEXT, preco_medio INT, preco_p95 INT)`
- Products: GASOLINA, ETANOL, DIESEL, etc.
- Join against `expenses` on UF (from deputy state) and ISO week of `data_documento`

### 11. `FUEL_PRICE_ABOVE_ANP`

- **Signal**: Medium — 25 pt
- **Depends on**: #3 (OCR litre quantity extraction) + #10 (ANP pipeline)
- For `tipo_despesa = COMBUSTIVEIS E LUBRIFICANTES`: `valor_liquido / extracted_litres > ANP regional P95`
- COMBUSTIVEIS is the largest single category (233k rows, 35% of all expenses)
- Limited to ~25% of COMBUSTIVEIS docs that are text-extractable (§2)

---

## Tier 5 — Score Calibration (run once, after all flags above)

### 12. Scoring recalibration — Option A weights + two-tier thresholds

- Run simulation script from §10.7 of `heuristics-validation.md` against `etl/seed.db` after all flags above are implemented
- **Option A** (statistically preferred): bring all weights to within 1.5× their empirical WoE floor; keep "escalate" for Definitive tier
- **Two-tier threshold system** (replaces arbitrary 50 pt single threshold):
  | Tier | Score | Alert rate | Catches |
  |---|:---:|:---:|---|
  | Review (yellow) | ≥ 25 | ~2.5% (~16,400 exp.) | DUPLICATE+RECIBO, EXPENSE_ABROAD + any co-signal |
  | Priority (orange) | ≥ 32 | ~0.66% (~4,400 exp.) | Three or more co-occurring meaningful signals |
  | Escalate (red) | bypass | ~0% | `CROSS_POLITICIAN_INVOICE` |
- **Thresholds must be re-simulated after each new flag is added** — every external-data flag shifts the distribution rightward and increases alert rates

---

## Dependency Graph

```
forensic_flags table — TO BE ADDED BACK
 └─► CROSS_POLITICIAN_INVOICE_REUSE — TO BE ADDED BACK

#2 (cod=4 HTML fix)
 └─► #3 PDF/OCR pipeline
       └─► #4 CATEGORY_MISMATCH
       └─► #5 PASSENGER_NAME_MISMATCH + FAMILY_PASSENGER
       └─► #6 CASH_PAYMENT

#7 (IBGE municipio codes)
 └─► #8 VENDOR_GEOGRAPHIC_ANOMALY  →  §6 composite

#10 (ANP pipeline) + #3 (OCR)
 └─► #11 FUEL_PRICE_ABOVE_ANP

#12 depends on all above (run once, at the end)
```
