# ETL Development Backlog — Forensic Scoring Pipeline

> Ordered by forensic analyst + statistical priority. Scoring recalibration is intentionally last — run once after all indicator data is in place.
>
> Signal strength tiers: **Definitive** = zero/near-zero FPR, auto-escalate; **High** = strong discriminator, rarely fires benign; **Medium** = context-dependent, best combined; **Low** = contributes only in aggregate.

---

## Tier 1 — High Signal, Vendor Data Already Ingested

All required data is in the `vendors` table from the existing `ReceitaFederalCNPJPipeline` run.

### 1. `VENDOR_CNAE_MISMATCH`

- **Signal**: High — 25 pt
- **Data**: `vendors.primary_cnae` (already populated)
- Curate incompatibility list per `tipo_despesa` using CNAE divisions (§6.3 disambiguation principle — unambiguous mismatches only, not a generic "not in expected set" approach)
  - CNAE divisions 01–03 (agriculture/fishing), 05–09 (mining), 10–25 (manufacturing) → incompatible with MANUTENCAO DE ESCRITORIO, LOCACAO VEICULOS, SEGURANCA
- **Empirically validated in corpus**: three agribusiness/cattle companies (CNAE 0151-2 Bovinocultura, 0162-8 Atividades de apoio à pecuária) billed R$14.25M under `MANUTENCAO DE ESCRITORIO`; one of them is in _recuperação judicial_
- Also contributes to the §6 composite escalation rule (see `POLITICALLY_CONNECTED_VENDOR` item #4)

### 2. `VENDOR_NO_EMPLOYEES` (interim 10 pt)

- **Signal**: High — 20 pt full / 10 pt interim
- **Data**: `vendors.company_size` (already populated)
- **Interim implementation**: `company_size = '01'` (Micro-empresa) as proxy, restricted to `tipo_despesa ∈ {SERVICO DE SEGURANCA, MANUTENCAO DE ESCRITORIO, LOCACAO OU FRETAMENTO DE VEICULOS}` — categories where zero employees is operationally implausible
- Do not apply to CPF vendors or MEI sole traders providing personal services
- Upgrade to 20 pt only after `employee_count` column is populated from RAIS data (see item #22)

---

## Tier 2 — TSE Cross-Reference

Unlocks the "Esquema de Locação Fantasma" composite from §6. `vendor_partners` is already fully populated (77,988 records, 89% of matched vendors).

### 3. TSE all-cargo candidates pipeline

- **Type**: New pipeline — blocker for item #4
- **Source**: `dadosabertos.tse.jus.br` — TSE candidate registration data
- Creates table: `tse_candidates(cpf TEXT, nome TEXT, cargo TEXT, partido TEXT, ano_eleicao INT, uf TEXT)`
- **Scope gate**: Must include ALL cargos (GOVERNADOR, DEPUTADO ESTADUAL, PREFEITO, VEREADOR, SENADOR, DEPUTADO FEDERAL, etc.) — do NOT filter by cargo or election result status
  - `TSE2022ElectionResultsPipeline` already filters to elected DEPUTADO_FEDERAL/SENADOR for the `politicians` table (the app's display model); `tse_candidates` is a separate ETL concern
  - Forensic value of `POLITICALLY_CONNECTED_VENDOR` scales with breadth of the CPF match pool
- **Architectural decision (decide at implementation time)**: extended pass inside `TSE2022ElectionResultsPipeline` (one ~500 MB ZIP download, two output tables) vs. dedicated sibling pipeline (isolated responsibility, re-downloads ZIP)

### 4. `POLITICALLY_CONNECTED_VENDOR`

- **Signal**: High — 50 pt standalone; **Definitive/auto-escalate** under §6 composite
- **Depends on**: #3 (`tse_candidates` table)
- Cross-reference `vendor_partners.partner_cpf_cnpj` = `tse_candidates.cpf`
- Pre-compute as a boolean or flag stored on `vendors` or written to `forensic_flags` at ETL time
- **§6 composite escalation rule**: When `POLITICALLY_CONNECTED_VENDOR` fires together with `RECIBO_DOCUMENT` and either `VENDOR_CNAE_MISMATCH` or `VENDOR_GEOGRAPHIC_ANOMALY`, the expense must auto-escalate to mandatory manual review regardless of total score — this combination should not be suppressible by a scoring threshold

### 5. TSE campaign donation pipeline

- **Type**: New pipeline — blocker for item #6
- **Source**: TSE `prestacao_de_contas` donation records (`dadosabertos.tse.jus.br`)
- Creates table: `tse_donations(donor_cpf TEXT, recipient_cpf TEXT, ano_eleicao INT, valor INT)`
- Cross all available election cycles

### 6. `CAMPAIGN_DONOR_VENDOR`

- **Signal**: High — 30 pt
- **Depends on**: #5 (`tse_donations` table) + `vendor_partners`
- Join path: `vendor_partners.partner_cpf_cnpj` → `tse_donations.donor_cpf` filtered to the paying deputy as recipient
- More legally actionable than `POLITICALLY_CONNECTED_VENDOR` (direct financial interest in re-election → kickback channel)

---

## Tier 2 — CEAP Schema Gaps + Existing Flag Fixes

### 7. Add `competency_year` / `competency_month` to `expenses`

- **Type**: Schema migration + pipeline update
- `ano` and `mes` are returned by the Câmara API (`ExpenseData` in `ExpensesPipeline.ts`) but not persisted in `ExpenseRow` or the DB schema
- Add `competency_year INT` and `competency_month INT` columns to `expenses` table
- Update `ExpensesPipeline` `onPageFetched` mapping to persist both fields
- Prerequisite for item #8

### 8. `COMPETENCY_DATE_MISMATCH`

- **Signal**: Medium — 20 pt
- **Depends on**: #7
- Logic: `data_documento` falls more than 90 days before the `competency_year`/`competency_month` period
- CEAP rules (Resolução da Mesa nº 43/2009) require submission within 90 days of expense date — significant backdating suggests document fabrication or retroactive justification

### 9. `SINGLE_CLIENT_VENDOR`

- **Signal**: Medium — 20 pt
- **Data**: CEAP only
- **Depends on**: `forensic_flags` infrastructure (to be added)
- Post-ingestion SQL: vendors with exactly 1 distinct `deputy_id` across ≥ 5 total expenses
- ≥ 5 minimum avoids penalising genuine one-off vendors
- Signal is strongest when combined with `VENDOR_IS_CPF` or `RECIBO_DOCUMENT`
- Corpus: 91,718 affected expenses (13.8% prevalence) — Medium tier is appropriate

### 10. `DUPLICATE_INVOICE` pipeline

- **Signal**: Medium-High — 40 pt
- **Data**: CEAP only (no external datasets)
- **Depends on**: `forensic_flags` infrastructure (to be added)
- Same `(cnpj_cpf_fornecedor, num_documento)` pair appears in ≥ 2 expenses for the **same `deputy_id`**
- Apply S/N placeholder exclusion before comparison (TRIM + UPPER normalisation): `S/N`, `s/n`, `SN`, `sn`, `S.N.`, `S/Nº`, `00`, `000`, `0`, `-`, blank — 1,111 of 6,777 raw duplicate pairs are S/N placeholders; without exclusion the 40 pt weight causes any S/N receipt to immediately exceed the "high suspicion" threshold on its own
- Apply same S/N exclusion list as `CROSS_DEPUTY_INVOICE_REUSE` (to be added as a separate task)
- Does **not** auto-escalate — same-deputy duplicate has a non-zero FPR: a data correction or amended-expense re-submission can produce identical `(cnpj, num_documento)` values under the same deputy. Unlike `CROSS_DEPUTY_INVOICE_REUSE`, there is no definitively fraudulent interpretation.
- Corpus: ~5,666 true duplicate pairs after S/N exclusion (~1.7% of corpus)

### 11. Fix `EXTREME_AMOUNT` guardrails

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

### 12. Handle `cod_tipo_documento = 4` HTML URLs

- **Type**: Architectural prerequisite — must be done before any PDF pipeline work
- `cod_tipo_documento = 4` links to `nota-fiscal-eletronica?ideDocumentoFiscal=XXXXXX` — an HTML page, not a PDF
- The pipeline must detect this pattern and skip PDF download/parse for these records
- Affects 210,212 expenses (31.6% of corpus) — without this fix any PDF pipeline fails on nearly a third of records

### 13. PDF extraction pipeline (pdf-parse + OCR fallback)

- **Type**: Core infrastructure — prerequisite for items #14, #15, #16
- **Depends on**: #12
- For `cod_tipo_documento ∈ {0, 1, 2, 3}` only
- **OCR is the primary path for `cod = 1`** (Recibos) — do not wait for pdf-parse to fail before invoking OCR; 81% of Recibos are image-based
- For `cod = 0` and others: pdf-parse first, OCR as fallback
- `ghostscript` and `imagemagick` are hard requirements, not optional
- PDF producer/creator tag (readable without decompression) enables smart routing: iText, PDFsharp, PDFium → text-extractable; HP Scan, iOS, Skia → skip pdf-parse entirely

### 14. `CATEGORY_MISMATCH`

- **Signal**: High — 35 pt
- **Depends on**: #13
- Apply unambiguous keyword table from §3.8 only (fuel, hotel, airline, food, postal keywords)
- **Require extracted text ≥ 100 chars** before applying keyword matching (OCR-sourced text with < 100 chars has too many typos and encoding errors to be reliable)
- ALUGUEL/CONDOMINIO keywords deliberately excluded — too many legitimate MANUTENCAO documents use these
- Coverage: ~16% of expenses have extractable text; low coverage but near-zero FPR on unambiguous hits

### 15. `PASSENGER_NAME_MISMATCH` + `FAMILY_PASSENGER` sub-flag

- **Signal**: High — 35 pt; Definitive/auto-escalate on `FAMILY_PASSENGER` (+15 pt)
- **Depends on**: #13
- Extend OCR pass for `tipo_despesa ∈ {PASSAGEM AEREA SIGEPA, PASSAGEM AEREA RPA}`
- Target label patterns: `"Passageiro:"`, `"Passenger:"`, `"Nome do Passageiro:"`
- Name comparison: NFD Unicode normalization + case-folding + token-overlap matching (handles middle-name reordering); a match on the last token of the deputy's name appearing anywhere in the extracted passenger name is sufficient
- `FAMILY_PASSENGER` sub-flag: mismatched passenger surname-matches the deputy's surname → escalate unconditionally
  - Apply same NFD normalization, last-name-token extraction, and 5% corpus frequency gate as `VENDOR_FAMILY_MEMBER` (item #19)
- Coverage: ~19–25% of PASSAGEM AEREA expenses (GOL/LATAM/AZUL e-tickets are frequently PDFium — text-extractable)

### 16. Cash payment detection (`CASH_PAYMENT`)

- **Signal**: Medium — +15 pt additive (not standalone)
- **Depends on**: #13
- OCR on `cod_tipo_documento = 1` only
- Target strings: `"em espécie"`, `"pagamento em dinheiro"`, `"pago em espécie"`
- Absent signal does NOT disprove cash payment — ~81% of Recibos are unextractable; do not use absence as exculpatory evidence

---

## Tier 4 — Geographic Enrichment

### 17. Add IBGE municipality code to `vendors`

- **Type**: Schema + enrichment — prerequisite for item #18
- New migration: `municipio_ibge_code TEXT` column on `vendors`
- RF Estabelecimentos `MUNICIPIO` column is already a numeric IBGE code — map to IBGE urban/rural classification table
- Standalone UF mismatch has 22–83% FPR by category (airlines, telecoms, ride-hailing are structurally registered in SP/RJ)

### 18. `VENDOR_GEOGRAPHIC_ANOMALY` (rural municipality precision)

- **Signal**: Medium — 20 pt (do not ship above 10 pt without item #22)
- **Depends on**: #17 (IBGE municipality codes)
- Flag: vendor registered in an IBGE-classified rural municipality while `tipo_despesa ∈ {MANUTENCAO DE ESCRITORIO, LOCACAO OU FRETAMENTO DE VEICULOS, SERVICO DE SEGURANCA}`
- Rural municipality dimension is far more discriminating than UF mismatch alone — a cattle-farming municipality cannot plausibly sublet urban office space
- Contributes to the §6 composite escalation rule alongside `POLITICALLY_CONNECTED_VENDOR` and `VENDOR_CNAE_MISMATCH`

---

## Tier 5 — Remaining Signal Enrichments

### 19. `VENDOR_FAMILY_MEMBER`

- **Signal**: Low — 15 pt (meaningful only in combination)
- **Data**: `politicians.name` + `vendor_partners.partner_name`
- Implementation specifics:
  1. Apply NFD Unicode normalization and extract only the **last name token** before matching
  2. Check is **bilateral in direction**: does a token from the deputy's surname appear as a token in the partner name (not vice versa)
  3. Enforce 5% corpus frequency gate: suppress flag for any surname whose match rate across all `vendor_partners` records exceeds 5%
  4. Corpus confirmation of noisiest surnames to gate: PEREIRA (40 partner matches), OLIVEIRA (35), SILVA (20)

### 20. ANP fuel price pipeline

- **Type**: New pipeline — blocker for item #21
- **Source**: ANP weekly pump price historical series (`dados.gov.br/dados/conjuntos-dados/serie-historica-de-precos-de-combustiveis-por-revenda`)
- Creates table: `anp_fuel_prices(uf TEXT, semana_inicio TEXT, produto TEXT, preco_medio INT, preco_p95 INT)`
- Products: GASOLINA, ETANOL, DIESEL, etc.
- Join against `expenses` on UF (from deputy state) and ISO week of `data_documento`

### 21. `FUEL_PRICE_ABOVE_ANP`

- **Signal**: Medium — 25 pt
- **Depends on**: #13 (OCR litre quantity extraction) + #20 (ANP pipeline)
- For `tipo_despesa = COMBUSTIVEIS E LUBRIFICANTES`: `valor_liquido / extracted_litres > ANP regional P95`
- COMBUSTIVEIS is the largest single category (233k rows, 35% of all expenses)
- Limited to ~25% of COMBUSTIVEIS docs that are text-extractable (§2)

### 22. Add `employee_count` to `vendors` from RAIS data

- **Type**: Schema enrichment — upgrades item #2 from 10 pt interim to 20 pt full signal
- Separate pipeline: RAIS (Relação Anual de Informações Sociais) or SIMEI/SIMPLES cross-reference
- Upgrade `VENDOR_NO_EMPLOYEES` to 20 pt after this column is populated

---

## Tier 6 — Score Calibration (run once, after all flags above)

### 23. Scoring recalibration — Option A weights + two-tier thresholds

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
#1 (forensic_flags table) — TO BE ADDED BACK
 └─► CROSS_DEPUTY_INVOICE_REUSE — TO BE ADDED BACK
 └─► #10 SINGLE_CLIENT_VENDOR
 └─► #11 DUPLICATE_INVOICE

#3 (TSE all-cargo pipeline)
 └─► #4 POLITICALLY_CONNECTED_VENDOR  →  §6 composite auto-escalation

#5 (TSE donations pipeline)
 └─► #6 CAMPAIGN_DONOR_VENDOR

#7 (expenses: ano/mes columns)
 └─► #8 COMPETENCY_DATE_MISMATCH

#12 (cod=4 HTML fix)
 └─► #13 PDF/OCR pipeline
       └─► #14 CATEGORY_MISMATCH
       └─► #15 PASSENGER_NAME_MISMATCH + FAMILY_PASSENGER
       └─► #16 CASH_PAYMENT

#17 (IBGE municipio codes)
 └─► #18 VENDOR_GEOGRAPHIC_ANOMALY  →  §6 composite

#20 (ANP pipeline) + #13 (OCR)
 └─► #21 FUEL_PRICE_ABOVE_ANP

#23 depends on all above (run once, at the end)
```
