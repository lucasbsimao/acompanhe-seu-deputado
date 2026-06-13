# ETL Development Backlog — Forensic Scoring Pipeline

> Ordered by forensic analyst + statistical priority. Scoring recalibration is intentionally last — run once after all indicator data is in place.
>
> Signal strength tiers: **Definitive** = zero/near-zero FPR, auto-escalate; **High** = strong discriminator, rarely fires benign; **Medium** = context-dependent, best combined; **Low** = contributes only in aggregate.

---

## Tier 1 — TSE Cross-Reference

Unlocks the "Esquema de Locação Fantasma" composite from §6. `vendor_partners` is already fully populated (77,988 records, 89% of matched vendors).

### 1. `CAMPAIGN_DONOR_VENDOR`

- **Signal**: High — 30 pt
- **Depends on**: `tse_donations` table + `vendor_partners`
- Join path: `vendor_partners.partner_cpf_cnpj` → `tse_donations.donor_cpf` filtered to the paying deputy as recipient
- Represents direct financial interest in re-election (kickback channel)

---

## Tier 2 — CEAP Schema Gaps + Existing Flag Fixes

### 2. Add `competency_year` / `competency_month` to `expenses`

- **Type**: Schema migration + pipeline update
- `ano` and `mes` are returned by the Câmara API (`ExpenseData` in `ExpensesPipeline.ts`) but not persisted in `ExpenseRow` or the DB schema
- Add `competency_year INT` and `competency_month INT` columns to `expenses` table
- Update `ExpensesPipeline` `onPageFetched` mapping to persist both fields
- Prerequisite for item #3

### 3. `COMPETENCY_DATE_MISMATCH`

- **Signal**: Medium — 20 pt
- **Depends on**: #2
- Logic: `data_documento` falls more than 90 days before the `competency_year`/`competency_month` period
- CEAP rules (Resolução da Mesa nº 43/2009) require submission within 90 days of expense date — significant backdating suggests document fabrication or retroactive justification

### 4. `SINGLE_CLIENT_VENDOR`

- **Signal**: Medium — 20 pt
- **Data**: CEAP only
- **Depends on**: `forensic_flags` infrastructure (to be added)
- Post-ingestion SQL: vendors with exactly 1 distinct `deputy_id` across ≥ 5 total expenses
- ≥ 5 minimum avoids penalising genuine one-off vendors
- Signal is strongest when combined with `VENDOR_IS_CPF` or `RECIBO_DOCUMENT`
- Corpus: 91,718 affected expenses (13.8% prevalence) — Medium tier is appropriate

### 5. `DUPLICATE_INVOICE` pipeline

- **Signal**: Medium-High — 40 pt
- **Data**: CEAP only (no external datasets)
- **Depends on**: `forensic_flags` infrastructure (to be added)
- Same `(cnpj_cpf_fornecedor, num_documento)` pair appears in ≥ 2 expenses for the **same `deputy_id`**
- Apply S/N placeholder exclusion before comparison (TRIM + UPPER normalisation): `S/N`, `s/n`, `SN`, `sn`, `S.N.`, `S/Nº`, `00`, `000`, `0`, `-`, blank — 1,111 of 6,777 raw duplicate pairs are S/N placeholders; without exclusion the 40 pt weight causes any S/N receipt to immediately exceed the "high suspicion" threshold on its own
- Apply same S/N exclusion list as `CROSS_DEPUTY_INVOICE_REUSE` (to be added as a separate task)
- Does **not** auto-escalate — same-deputy duplicate has a non-zero FPR: a data correction or amended-expense re-submission can produce identical `(cnpj, num_documento)` values under the same deputy. Unlike `CROSS_DEPUTY_INVOICE_REUSE`, there is no definitively fraudulent interpretation.
- Corpus: ~5,666 true duplicate pairs after S/N exclusion (~1.7% of corpus)

### 6. Fix `EXTREME_AMOUNT` guardrails

- **Type**: Recalibration of existing flag logic
- Current behavior uses a global 3× median, which is miscalibrated for high-variance categories
  - TAXI: 3× global median = R$63, below Q3 — flags 15% of taxi expenses including any airport ride
  - MANUTENCAO: 25.9% flagged due to geographic rent variance (min R$102 → max R$19,499 per deputy)
  - SEGURANCA: bimodal distribution — monthly contracts vs individual bookings; 39.7% flagged
- Required changes:
  - Use **per-deputy median** for same `tipo_despesa` (not global median)
  - Minimum **5 prior expenses** per deputy per category before using per-deputy median; fall back to global P75 if below threshold
  - Use **5× multiplier** (instead of 3×) for: TAXI, MANUTENCAO DE ESCRITORIO, DIVULGACAO DA ATIVIDADE PARLAMENTAR, SERVICO DE SEGURANCA

---

## Tier 3 — PDF / OCR Infrastructure + Derived Flags

### 7. Handle `cod_tipo_documento = 4` HTML URLs

- **Type**: Architectural prerequisite — must be done before any PDF pipeline work
- `cod_tipo_documento = 4` links to `nota-fiscal-eletronica?ideDocumentoFiscal=XXXXXX` — an HTML page, not a PDF
- The pipeline must detect this pattern and skip PDF download/parse for these records
- Affects 210,212 expenses (31.6% of corpus) — without this fix any PDF pipeline fails on nearly a third of records

### 8. PDF extraction pipeline (pdf-parse + OCR fallback)

- **Type**: Core infrastructure — prerequisite for items #9, #10, #11
- **Depends on**: #7
- For `cod_tipo_documento ∈ {0, 1, 2, 3}` only
- **OCR is the primary path for `cod = 1`** (Recibos) — do not wait for pdf-parse to fail before invoking OCR; 81% of Recibos are image-based
- For `cod = 0` and others: pdf-parse first, OCR as fallback
- `ghostscript` and `imagemagick` are hard requirements, not optional
- PDF producer/creator tag (readable without decompression) enables smart routing: iText, PDFsharp, PDFium → text-extractable; HP Scan, iOS, Skia → skip pdf-parse entirely

### 9. `CATEGORY_MISMATCH`

- **Signal**: High — 35 pt
- **Depends on**: #8
- Apply unambiguous keyword table from §3.8 only (fuel, hotel, airline, food, postal keywords)
- **Require extracted text ≥ 100 chars** before applying keyword matching (OCR-sourced text with < 100 chars has too many typos and encoding errors to be reliable)
- ALUGUEL/CONDOMINIO keywords deliberately excluded — too many legitimate MANUTENCAO documents use these
- Coverage: ~16% of expenses have extractable text; low coverage but near-zero FPR on unambiguous hits

### 10. `PASSENGER_NAME_MISMATCH` + `FAMILY_PASSENGER` sub-flag

- **Signal**: High — 35 pt; Definitive/auto-escalate on `FAMILY_PASSENGER` (+15 pt)
- **Depends on**: #8
- Extend OCR pass for `tipo_despesa ∈ {PASSAGEM AEREA SIGEPA, PASSAGEM AEREA RPA}`
- Target label patterns: `"Passageiro:"`, `"Passenger:"`, `"Nome do Passageiro:"`
- Name comparison: NFD Unicode normalization + case-folding + token-overlap matching (handles middle-name reordering); a match on the last token of the deputy's name appearing anywhere in the extracted passenger name is sufficient
- `FAMILY_PASSENGER` sub-flag: mismatched passenger surname-matches the deputy's surname → escalate unconditionally
  - Apply same NFD normalization, last-name-token extraction, and 5% corpus frequency gate as `VENDOR_FAMILY_MEMBER` (item #14)
- Coverage: ~19–25% of PASSAGEM AEREA expenses (GOL/LATAM/AZUL e-tickets are frequently PDFium — text-extractable)

### 11. Cash payment detection (`CASH_PAYMENT`)

- **Signal**: Medium — +15 pt additive (not standalone)
- **Depends on**: #8
- OCR on `cod_tipo_documento = 1` only
- Target strings: `"em espécie"`, `"pagamento em dinheiro"`, `"pago em espécie"`
- Absent signal does NOT disprove cash payment — ~81% of Recibos are unextractable; do not use absence as exculpatory evidence

---

## Tier 4 — Geographic Enrichment

### 12. Add IBGE municipality code to `vendors`

- **Type**: Schema + enrichment — prerequisite for item #13
- New migration: `municipio_ibge_code TEXT` column on `vendors`
- RF Estabelecimentos `MUNICIPIO` column is already a numeric IBGE code — map to IBGE urban/rural classification table
- Standalone UF mismatch has 22–83% FPR by category (airlines, telecoms, ride-hailing are structurally registered in SP/RJ)

### 13. `VENDOR_GEOGRAPHIC_ANOMALY` (rural municipality precision)

- **Signal**: Medium — 20 pt
- **Depends on**: #12 (IBGE municipality codes)
- Flag: vendor registered in an IBGE-classified rural municipality while `tipo_despesa ∈ {MANUTENCAO DE ESCRITORIO, LOCACAO OU FRETAMENTO DE VEICULOS, SERVICO DE SEGURANCA}`
- Rural municipality dimension is far more discriminating than UF mismatch alone — a cattle-farming municipality cannot plausibly sublet urban office space
- Contributes to the §6 composite escalation rule alongside `RECIBO_DOCUMENT` and `POLITICALLY_CONNECTED_VENDOR` (now removed, see §6 for composite logic)

---

## Tier 5 — Remaining Signal Enrichments

### 14. `VENDOR_FAMILY_MEMBER`

- **Signal**: Low — 15 pt (meaningful only in combination)
- **Data**: `politicians.name` + `vendor_partners.partner_name`
- Implementation specifics:
  1. Apply NFD Unicode normalization and extract only the **last name token** before matching
  2. Check is **bilateral in direction**: does a token from the deputy's surname appear as a token in the partner name (not vice versa)
  3. Enforce 5% corpus frequency gate: suppress flag for any surname whose match rate across all `vendor_partners` records exceeds 5%
  4. Corpus confirmation of noisiest surnames to gate: PEREIRA (40 partner matches), OLIVEIRA (35), SILVA (20)

### 15. ANP fuel price pipeline

- **Type**: New pipeline — blocker for item #16
- **Source**: ANP weekly pump price historical series (`dados.gov.br/dados/conjuntos-dados/serie-historica-de-precos-de-combustiveis-por-revenda`)
- Creates table: `anp_fuel_prices(uf TEXT, semana_inicio TEXT, produto TEXT, preco_medio INT, preco_p95 INT)`
- Products: GASOLINA, ETANOL, DIESEL, etc.
- Join against `expenses` on UF (from deputy state) and ISO week of `data_documento`

### 16. `FUEL_PRICE_ABOVE_ANP`

- **Signal**: Medium — 25 pt
- **Depends on**: #8 (OCR litre quantity extraction) + #15 (ANP pipeline)
- For `tipo_despesa = COMBUSTIVEIS E LUBRIFICANTES`: `valor_liquido / extracted_litres > ANP regional P95`
- COMBUSTIVEIS is the largest single category (233k rows, 35% of all expenses)
- Limited to ~25% of COMBUSTIVEIS docs that are text-extractable (§2)

---

## Tier 6 — Score Calibration (run once, after all flags above)

### 17. Scoring recalibration — Option A weights + two-tier thresholds

- Run simulation script from §10.7 of `heuristics-validation.md` against `etl/seed.db` after all flags above are implemented
- **Option A** (statistically preferred): bring all weights to within 1.5× their empirical WoE floor; keep "escalate" for Definitive tier
- **Two-tier threshold system** (replaces arbitrary 50 pt single threshold):
  | Tier | Score | Alert rate | Catches |
  |---|:---:|:---:|---|
  | Review (yellow) | ≥ 25 | ~2.5% (~16,400 exp.) | DUPLICATE+RECIBO, EXPENSE_ABROAD + any co-signal |
  | Priority (orange) | ≥ 32 | ~0.66% (~4,400 exp.) | Three or more co-occurring meaningful signals |
  | Escalate (red) | bypass | ~0% | `CROSS_DEPUTY_INVOICE` |
- **Thresholds must be re-simulated after each new flag is added** — every external-data flag shifts the distribution rightward and increases alert rates

---

## Dependency Graph

```
forensic_flags table — TO BE ADDED BACK
 └─► CROSS_DEPUTY_INVOICE_REUSE — TO BE ADDED BACK
 └─► #5 SINGLE_CLIENT_VENDOR
 └─► #6 DUPLICATE_INVOICE

`tse_donations` table
 └─► #1 CAMPAIGN_DONOR_VENDOR

#2 (expenses: ano/mes columns)
 └─► #3 COMPETENCY_DATE_MISMATCH

#7 (cod=4 HTML fix)
 └─► #8 PDF/OCR pipeline
       └─► #9 CATEGORY_MISMATCH
       └─► #10 PASSENGER_NAME_MISMATCH + FAMILY_PASSENGER
       └─► #11 CASH_PAYMENT

#12 (IBGE municipio codes)
 └─► #13 VENDOR_GEOGRAPHIC_ANOMALY  →  §6 composite

#15 (ANP pipeline) + #8 (OCR)
 └─► #16 FUEL_PRICE_ABOVE_ANP

#17 depends on all above (run once, at the end)
```
