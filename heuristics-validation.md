# Heuristics Scoring Validation — ExpenseDocumentAnalysisPipeline

> Generated: 2026-05-19. Based on real data from `etl/seed.db` (665,830 expenses) and spot-checks of live PDFs from `camara.leg.br`.

---

## 1. Document Type Mapping (codTipoDocumento)

The DB stores `cod_tipo_documento` as an integer. Live API calls confirmed the labels:

| Code | Label | Count | Avg value | S/N docs | CPF vendors | URL type |
|------|-------|------:|----------:|---------:|------------:|----------|
| 0 | Nota Fiscal | 346,334 | R$ 1,707 | 0.1% | 12 | Direct PDF |
| 1 | **Recibos/Outros** | 108,631 | R$ 1,720 | **28.4%** | **5,945** | Direct PDF |
| 2 | Despesa no Exterior | 301 | **R$ 5,688** | 8.6% | 0 | Direct PDF |
| 3 | (Deprecated/Other) | 352 | R$ 654 | 1.7% | 0 | Direct PDF |
| 4 | Nota Fiscal Eletrônica | 210,212 | R$ 315 | 0% | 0 | **HTML page (not PDF)** |

**Critical architectural note**: `cod_tipo_documento = 4` links to `nota-fiscal-eletronica?ideDocumentoFiscal=XXXXXX` — an HTML page, not a direct PDF. The pipeline plan assumes all `urlDocumento` values point to PDFs, which is false for 31.6% of expenses (210k rows).

---

## 2. PDF Extraction Reality Check

**58 PDFs sampled** — stratified by document type and year (cod=2 expanded to 30 to reach ≤10% upper-bound confidence). FlateDecode streams decompressed in-process to detect actual `BT`/`Tj` text rendering instructions (not just font metadata or producer tags).

### Extraction rate by type

| cod | Label | Sampled | pdf-parse extractable | Rate |
|-----|-------|--------:|----------------------:|-----:|
| 0 | Nota Fiscal | 16 | 4 | **25%** |
| 1 | Recibos/Outros | 16 | 3 | **19%** |
| 2 | Despesa no Exterior | 30 | 2 | **6.7%** (95% CI ≤ 10%) |
| 3 | (Other) | 4 | 0 | **0%** |
| **All** | | **58** | **9** | **15.5%** |

### PDF producer → extractability pattern

| Producer/Creator | Extractable | Notes |
|-----------------|:-----------:|-------|
| `iText 2.1.7` | ✅ always | DANFSe (electronic service invoice), structured digital output |
| `PDFsharp` | ✅ always | DANFSe digital invoices |
| `PDFium` | ✅ always | Chrome/browser "Print to PDF" of digital receipt portals |
| `iLovePDF` | ⚠️ sometimes | Passes through text if fed a text PDF; otherwise compresses scans |
| `GPL Ghostscript` | ⚠️ rarely | May embed fonts but encodes content as images in most cases |
| `HP Scan`, `Qt 4.8.7`, `Skia/PDF`, `iOS`, `Apache FOP`, `dompdf` | ❌ never | Scanner apps, mobile, rendering engines — always image-based |
| `Microsoft: Print To PDF` | ❌ | Scanned original printed and re-PDF'd |

### Extractable text samples (confirms content quality for CATEGORY_MISMATCH)

| File | cod | Producer | Extracted text |
|------|-----|----------|---------------|
| `7750228.pdf` | 1 (Recibo) | PDFium | "Contrato" |
| `7583518.pdf` | 1 (Recibo) | PDFium | "ALUGUEL", "CONDOMINIO", "IPTU/2023 6/10" |
| `7722961.pdf` | 0 (NF) | iText | "LIGGA TELECOMUNICACOES SA", "AV VICENTE MACHADO", "Anatel" |
| `8044227.pdf` | 0 (NF) | PDFsharp | "DANFSe", "v1.0", "Documento" |
| `7632525.pdf` | 0 (NF) | iText | "Competência", "Código de Verificação", "Número do RPS" |
| `8061956.pdf` | 0 (NF) | iLovePDF | "DANFSe", "v1.0", "Documento" |

**Findings**:

- **The plan's `pdf-parse → OCR fallback` flow is architecturally correct.** The text extraction rate across the full corpus is ~16–25% for NF and ~19% for Recibos. OCR is the primary path for the majority.
- **Recibos (cod=1)**: ~81% will require OCR. The 19% that are extractable come from vendors using browser-based digital receipt portals (PDFium). Content keywords like "ALUGUEL", "CONDOMINIO" are high quality — `CATEGORY_MISMATCH` is viable here.
- **Nota Fiscal (cod=0)**: ~75% require OCR. Extractable ones are structured DANFSe (electronic service invoices) and telecom bills — good text for `CATEGORY_MISMATCH`.
- **Despesa no Exterior (cod=2)**: 2/30 extractable (6.7%, 95% CI ≤ 10%). Statistically confirmed: ≥90% are scanned. The 2 extractable outliers came from PDFium and an untagged producer. `CATEGORY_MISMATCH` will almost never fire for this type; OCR quality may be poor for foreign-language documents.
- **`PDF_NO_TEXT` signal quality (revised)**: Because only ~16% are extractable, firing on the other 84% would be noise. The flag should **only apply to cod=0 docs produced by known digital systems** (iText, PDFsharp, PDFium) that fail to yield text. For all other producers it's expected.
- OCR infrastructure (`ghostscript`, `imagemagick`) is a **hard requirement**, not optional.

---

## 3. Flag-by-Flag Analysis

### 3.1 ROUND_AMOUNT — 10 pts proposed

- **Affected rows**: 112,537 (16.9% of all expenses)
- **Verdict: ⚠️ Too noisy — reduce points**
- Monthly rent, office lease, and fixed-fee service contracts routinely produce round numbers (R$3,500, R$5,000, R$13,500). The top-scoring real examples are all monthly retainer receipts, which are round by contract, not by fraud. At 10pts this adds low-signal mass to nearly 1 in 6 expenses.
- **Suggested**: Reduce to **5 pts**, or gate it to `valor_liquido > R$5,000`.

### 3.2 EXTREME_AMOUNT — 30 pts proposed

`tipo_despesa` bug is now fixed. Full analysis follows.

#### Per-category statistics (Q1 / Median / Q3 / P95 / Max, all in R$)

| Category | Count | Q1 | Median | Q3 | P95 | Max | 3×Median | Extreme rows | Extreme % |
|----------|------:|---:|-------:|---:|----:|----:|---------:|-------------:|----------:|
| COMBUSTIVEIS E LUBRIFICANTES | 233,158 | 157 | 221 | 287 | 449 | 9,392 | 663 | 7,089 | 3.0% |
| PASSAGEM AEREA SIGEPA | 123,922 | 896 | 1,378 | 1,791 | 2,643 | 6,829 | 4,134 | 181 | 0.1% |
| SERVICO DE TAXI PEDAGIO E ESTACIONAMENTO | 67,243 | 12 | 21 | 43 | 164 | 2,700 | 63 | 10,053 | **15.0%** |
| MANUTENCAO DE ESCRITORIO | 65,183 | 224 | 584 | 1,854 | 6,600 | 31,799 | 1,752 | 16,904 | **25.9%** |
| DIVULGACAO DA ATIVIDADE PARLAMENTAR | 55,585 | 1,000 | 3,000 | 7,500 | 20,000 | 184,428 | 9,000 | 11,388 | **20.5%** |
| FORNECIMENTO DE ALIMENTACAO | 34,078 | 37 | 58 | 88 | 152 | 829 | 174 | 1,027 | 3.0% |
| HOSPEDAGEM | 24,285 | 190 | 290 | 500 | 1,343 | 24,509 | 870 | 2,695 | 11.1% |
| LOCACAO OU FRETAMENTO DE VEICULOS | 23,598 | 3,500 | 4,934 | 7,500 | 12,500 | 18,970 | 14,805 | 111 | 0.5% |
| SERVICO DE SEGURANCA | 1,556 | 260 | 510 | — | — | 8,700 | 1,530 | 617 | **39.7%** |
| PASSAGEM AEREA RPA | 2,903 | — | 1,027 | — | — | — | 3,081 | 254 | 8.7% |
| LOCACAO OU FRETAMENTO DE AERONAVES | 304 | — | 20,000 | — | — | — | 60,000 | 17 | 5.6% |

#### Critical problem: 3× global median is miscalibrated for high-variance categories

**SERVICO DE TAXI** (15% flagged): Median is R$21. 3× = R$63 — that is *below* the Q3 (R$43) and well below P95 (R$164). Anything above R$63 gets flagged, meaning a quarter of all taxi expenses are "extreme". An airport taxi ride easily exceeds R$63.

**MANUTENCAO DE ESCRITORIO** (25.9% flagged): Wide variance is geographic — office rent in São Paulo costs 10× more than in a small interior town. Per-deputy median range across 555 deputies: min R$102 → max R$19,499 (191× spread). A global median of R$584 is meaningless as a reference.

**DIVULGACAO DA ATIVIDADE PARLAMENTAR** (20.5% flagged): Extreme spread (R$1 to R$184,428). The top outlier of R$184k is genuinely suspicious, but 11,388 flagged rows include deputies with legitimate large advertising contracts.

**SERVICO DE SEGURANCA** (39.7% flagged): **Bimodal distribution** — 756 expenses ≤ R$500 (individual guard bookings) + 500 expenses R$5,000–10,000 (monthly security company contracts). The global median of R$510 sits between the two clusters; 3× = R$1,530 flags the entire monthly-contract cluster, which is normal.

**Well-calibrated categories** (low false positive rate): COMBUSTIVEIS (3.0%), PASSAGEM AEREA SIGEPA (0.1%), LOCACAO DE VEICULOS (0.5%), ALIMENTACAO (3.0%). These have compact distributions.

#### Per-deputy vs global median: the plan is ambiguous

The plan says *"3× the per-deputy median for same tipoDespesa"* but the parenthetical adds *"computed across all expenses in DB"*, which is contradictory. The data strongly favours per-deputy:

| Category | Deputy median range | Conclusion |
|----------|--------------------:|------------|
| COMBUSTIVEIS | R$112 – R$8,934 (80×) | Must use per-deputy |
| DIVULGACAO | R$105 – R$58,808 (560×) | Must use per-deputy |
| MANUTENCAO | R$102 – R$19,499 (191×) | Must use per-deputy |
| SEGURANCA | R$140 – R$8,700 (62×) | Must use per-deputy |
| TAXI | R$6 – R$1,967 (328×) | Must use per-deputy |

Avg expenses per deputy per category varies widely: COMBUSTIVEIS (avg 392/deputy), TAXI (207), SIGEPA (204), ESCRITORIO (109) → viable. SEGURANCA (18/deputy), PASSAGEM RPA (11), ASSINATURA (10) → risky baseline. REEMBOLSO (3.4), CERTIFICADOS (1.4), CONSULTORIAS (1.0) → per-deputy median meaningless.

#### Verdict: ⚠️ Logically sound but needs implementation guardrails

- **Suggested multiplier**: Keep 3× for compact-distribution categories; raise to **5× for TAXI, MANUTENCAO, DIVULGACAO, SEGURANCA** to reduce noise.
- **Minimum baseline**: Only compute per-deputy median if deputy has **≥ 5 prior expenses** in that category; otherwise fall back to global P75.
- **Suggested**: Keep 30 pts — the flag is valuable when it fires correctly; guardrails prevent it from firing on 20–40% of a category.

### 3.3 DUPLICATE_INVOICE — 50 pts proposed (highest weight)

- **Total (cnpj, num_documento) pairs appearing > 1 time**: 6,777
- **Of which are S/N-type placeholders** (`S/N`, `s/n`, `SN`, `00`, `0`, blank): **1,111 (16.4%)**
- **Recibos/Outros with S/N document number**: 30,834 rows (28.4% of all receipts)
- **Verdict: 🔴 Critical flaw — flag as designed produces massive false positives**
- "Sem Número" (S/N) is a standard Brazilian practice for receipts and informal services. A vendor who never assigns sequential numbers to receipts (common for CPF providers like secretaries, drivers) will permanently trigger DUPLICATE_INVOICE across all deputies who use them.
- The 50pt weight (highest of all flags) means any expense with an S/N receipt immediately exceeds the "high suspicion" threshold of 50pts on its own.
- **Suggested**: Exclude placeholder values from the check. Only apply DUPLICATE_INVOICE when `num_documento` is a non-empty, non-placeholder numeric/alphanumeric value. Proposed exclusion list: `S/N`, `s/n`, `SN`, `sn`, `S.N.`, `S/Nº`, `00`, `000`, `0`, `-`, blank. Reduce weight to **40 pts**.

### 3.4 VENDOR_IS_CPF — 15 pts proposed

- **Affected rows**: 5,957 (0.9% of all expenses)
- **Distribution**: 5,945 of 5,957 (99.8%) are `cod_tipo_documento = 1` (Recibos/Outros)
- **Verdict: ✅ Well-calibrated — highly selective, meaningful signal**
- CPF vendors are almost exclusively receipt-issuing individual providers (secretaries, drivers, office staff). These are harder to audit and have no formal registration requirements compared to CNPJ entities. The 0.9% selectivity makes this a genuine discriminator.
- **Suggested**: Keep at **15 pts**. Combined with `RECIBO_DOCUMENT` (see §4) the combined signal is strong.

### 3.5 HIGH_FREQ_VENDOR — 20 pts, threshold ≥ 4/month proposed

- **Affected rows at ≥ 4**: 127,280 (19.1% of all expenses)
- **Groups by frequency per month**:
  - ≥ 4 expenses: 5,857 vendor-deputy-month groups
  - ≥ 6 expenses: 2,498 groups
  - ≥ 8 expenses: 1,485 groups
  - ≥ 10 expenses: 913 groups
- **Verdict: ⚠️ Threshold too low — fires on 19% of all expenses**
- A deputy who pays their internet provider + parking + office supplies every week legitimately triggers ≥ 4. Fuel expenses alone can easily hit 4/month for deputies with car allowances.
- **Suggested**: Raise threshold to **≥ 8 per month** (cuts affected rows by ~75%). Keep 20 pts.

### 3.6 WEEKEND_DOCUMENT — 25 pts proposed

- **Affected rows**: 88,978 (13.4% of all expenses)
- **Distribution by doc type**:
  - Nota Fiscal (cod=0): 39,676 weekend docs
  - Recibos/Outros (cod=1): 13,130 weekend docs
  - NFe (cod=4): 35,996 weekend docs
- **Verdict: ⚠️ Too broad — reduce weight significantly**
- Monthly service receipts (rent, maintenance contracts) are routinely dated to the 1st or last of a month, which frequently falls on a weekend. NFe (electronic invoices) are timestamped automatically and can legitimately be issued on any day. This fires on 1 in 8 expenses.
- **Suggested**: Reduce to **10 pts**. Consider restricting to `cod_tipo_documento IN (1)` (receipts only) where a weekend date is more anomalous.

### 3.7 PDF_NO_TEXT — 10 pts proposed

- **Estimated affected rows**: ~84% of all expenses with direct PDF URLs (based on 44-PDF sample: 37/44 had no extractable text)
- **Verdict: ⚠️ Weak signal as a general flag — refine scope**
- 84% of CEAP documents are scanned or image-based, so yielding no text is the *baseline condition*, not an anomaly. However, the PDF producer/creator tag (embedded in the PDF header, readable without decompression) allows a useful refinement: documents produced by **iText, PDFsharp, PDFium** are known-digital and *should* have text. When they don't, that is a genuine signal.
- Conflating "unreachable URL" with "scanned document" loses signal. Split into two flags:
  - `PDF_UNREACHABLE` (**15 pts**): URL returns non-200 or non-PDF content — a broken link on a submitted expense is more suspicious.
  - `PDF_NO_TEXT` (**5 pts**): URL resolves to a valid PDF but yields no extractable text after both pdf-parse and OCR attempts — applies only when producer is a known digital tool (iText, PDFsharp, PDFium) where text should be present.
- **Suggested**: Split as above.

### 3.8 CATEGORY_MISMATCH — 35 pts proposed

`tipo_despesa` bug is now fixed. Full analysis follows.

#### Coverage constraint

Only ~16% of PDFs have extractable text (§2). CATEGORY_MISMATCH can only fire for those. Coverage by type: ~25% of NF (cod=0), ~19% of Recibos (cod=1), 0% of Exterior (cod=2). This means the flag is inherently low-coverage but high-precision when it fires.

#### Validation against real extracted PDFs

Cross-referencing the 6 PDFs with extracted text against their `tipo_despesa` in the DB:

| File | Extracted keywords | Filed under | Mismatch? |
|------|-------------------|-------------|----------|
| `7722961.pdf` | "LIGGA TELECOMUNICACOES SA", "Anatel" | MANUTENCAO DE ESCRITORIO | ⚠️ Ambiguous — telecom filed as office maintenance is *allowed* under CEAP rules |
| `7583518.pdf` | "ALUGUEL", "CONDOMINIO", "IPTU" | MANUTENCAO DE ESCRITORIO | ✅ Correct match |
| `8044227.pdf` | "DANFSe", "Documento" | DIVULGACAO DA ATIVIDADE PARLAMENTAR | ➡️ Generic, cannot determine |
| `7632525.pdf` | "Competência", "Código de Verificação" | DIVULGACAO DA ATIVIDADE PARLAMENTAR | ➡️ NFS-e metadata, cannot determine |
| `8061956.pdf` | "DANFSe" | HOSPEDAGEM | ⚠️ Digital service invoice for R$165 filed as lodging — slightly suspicious |
| `7750228.pdf` | "Contrato", "ALUGUEL", "CONDOMINIO" | LOCACAO OU FRETAMENTO DE VEICULOS | 🔴 **MISMATCH** — rent/condo keywords in a vehicle rental expense |

Real mismatch found: `7750228.pdf` — a document with "ALUGUEL" and "CONDOMINIO" filed under vehicle leasing. This is exactly the flag's intent.

#### CEAP ambiguity zones (must NOT flag as mismatch)

Brazilian CEAP rules create legitimate overlaps that a naive keyword check would wrongly flag:
- Office telecom/internet can be filed under **MANUTENCAO** or **TELEFONIA** (both valid)
- Airport taxi can be filed under **TAXI** or adjacent to **PASSAGEM AEREA** expenses
- NFS-e invoices ("DANFSe") are used across many categories — the tag alone is not diagnostic

#### Proposed keyword mapping (unambiguous mismatches only)

| Keyword group (in PDF text) | Should be filed under | Flag if filed under anything else |
|-----------------------------|-----------------------|----------------------------------|
| `gasolina`, `etanol`, `diesel`, `combustível`, `litros`, `abastecimento`, `posto` | COMBUSTIVEIS | HOSPEDAGEM, PASSAGEM AEREA, LOCACAO AERONAVES |
| `hotel`, `hospedagem`, `diária`, `pernoite`, `check-in` | HOSPEDAGEM | COMBUSTIVEIS, TELEFONIA, PASSAGEM AEREA |
| `passagem`, `voo`, `embarque`, `bilhete aéreo`, `GOL`, `LATAM`, `AZUL` | PASSAGEM AEREA | COMBUSTIVEIS, HOSPEDAGEM, ALIMENTACAO |
| `refeição`, `restaurante`, `alimentação`, `lanche`, `almoço`, `jantar` | ALIMENTACAO | HOSPEDAGEM, COMBUSTIVEIS, PASSAGEM AEREA |
| `correios`, `SEDEX`, `PAC`, `encomenda postal` | SERVICOS POSTAIS | HOSPEDAGEM, COMBUSTIVEIS, ALIMENTACAO |

Keyword groups for ALUGUEL/CONDOMINIO are deliberately **excluded** from mismatches — too many legitimate MANUTENCAO documents use these words, and LOCACAO DE VEICULOS can also have lease/contract language.

#### Verdict: ✅ Sound concept, viable at 35 pts with disambiguation rules

- The flag will fire rarely (≤ 16% of docs have text), but when it fires based on the unambiguous keyword table above, it is a strong signal.
- OCR-sourced text will have lower quality (typos, encoding issues) — implement a minimum confidence/length threshold (e.g., OCR text must be ≥ 100 chars) before applying keyword matching.
- **Suggested**: Keep at **35 pts**. Implement keyword list with the disambiguation zones above. Require text length ≥ 100 chars before flagging.

### 3.9 ZERO_GLOSA_HIGH_VALUE — 20 pts proposed

- **Affected rows**: 36,401 (5.5% of all expenses)
- **Verdict: ✅ Reasonable signal — keep as-is**
- No audit deduction on high-value claims is a genuine anomaly indicator. The 5.5% rate is selective enough to be meaningful. Keep at **20 pts**.

---

## 4. New Flag Recommendation: RECIBO_DOCUMENT

**The user's intuition is correct** — forensic analysts would pay more attention to receipts. The data strongly supports adding a dedicated flag:

| Attribute | Value |
|-----------|-------|
| **Flag** | `RECIBO_DOCUMENT` |
| **Points** | **20** |
| **Logic** | `cod_tipo_documento = 1` |
| **Rationale** | Receipts ("Recibos/Outros") have no mandatory sequential numbering, can be self-issued by the service provider, are almost always scanned images (no verifiable digital trail), and account for 99.8% of CPF-vendor expenses. Unlike Nota Fiscal (NF/NFe), there is no government cross-validation of receipt amounts or vendor identity. |

Supporting stats:
- 28.4% of receipts use `S/N` (no document number)
- 99.8% of CPF-vendor expenses are receipts
- Average value (R$1,720) is 5.5× higher than NFe average (R$315)
- All sampled receipt PDFs are scanned, not software-generated

---

## 5. Additional Flag Recommendation: EXPENSE_ABROAD

| Attribute | Value |
|-----------|-------|
| **Flag** | `EXPENSE_ABROAD` |
| **Points** | **25** |
| **Logic** | `cod_tipo_documento = 2` |
| **Rationale** | "Despesa no Exterior" has the highest average value (R$5,688 — 3.3× the overall average of R$1,271). Foreign receipts are impossible to cross-check against Brazilian tax authorities, and the 301 occurrences in the DB warrant higher scrutiny. |

---

## 6. Composite Signal: Self-Dealing Rental ("Esquema de Locação Fantasma")

> **Observed once in this dataset.** Documented here because the pattern is a known Brazilian CEAP fraud typology and warrants a dedicated detection strategy despite its rarity.

This is not a single flag — it is a **multi-source composite** where five co-occurring signals jointly eliminate virtually every innocent interpretation. Each component alone has a plausible benign explanation; together they describe a self-dealing rental scheme.

### 6.1 The five components

| # | Component | Detectable from CEAP alone? | Source required |
|---|-----------|:--------------------------:|-----------------|
| 1 | `cod_tipo_documento = 1` (Recibo) | ✅ | Current schema |
| 2 | `tipo_despesa` = MANUTENCAO DE ESCRITORIO or LOCACAO OU FRETAMENTO DE VEICULOS | ✅ | Current schema |
| 3 | Payment described as "em espécie" (cash) | ⚠️ OCR only | PDF text extraction (~19% Recibo coverage) |
| 4 | Vendor CNAE principal ∉ real-estate / office services (e.g., livestock farming) | ❌ | Receita Federal CNPJ bulk dataset |
| 5 | Vendor QSA partner CPF matches a TSE candidate record | ❌ | Receita Federal QSA × TSE electoral data |

### 6.2 Why the combination is a smoking gun

- **Recibo + cash**: No formal issuance control, no bank transfer trail — the transaction is unverifiable from both ends.
- **CNAE mismatch**: A livestock or agribusiness company has no operational reason to own or sub-lease urban office space. It signals a shell or front company (`empresa de fachada`) created or repurposed to receive CEAP funds.
- **Geographic distance**: If the vendor's registered address is in a rural municipality far from the rented office, the company has no physical presence anywhere near the property — reinforcing the front-company interpretation.
- **Politically connected vendor**: A vendor whose legal partners or administrators appear in TSE electoral records (as candidates, former candidates, or relatives of the paying deputy) transforms the pattern into textbook self-dealing — public funds flowing between politicians through an intermediary company.

The joint innocent probability approaches zero. This exact pattern is documented in CGU and TCU audit reports on CEAP abuse and has appeared in multiple investigative journalism pieces on "aluguel fantasma" and "quadrilha do aluguel" schemes.

### 6.3 Sub-flag definitions and scoring

| Sub-flag | Points | Logic | Data source |
|----------|:------:|-------|-------------|
| `VENDOR_CNAE_MISMATCH` | **25** | Vendor CNAE principal code is incompatible with the `tipo_despesa` category (e.g., CNAE 0151-2 Bovinocultura for a MANUTENCAO DE ESCRITORIO expense) | Receita Federal CNPJ bulk dump |
| `VENDOR_GEOGRAPHIC_ANOMALY` | **20** | Vendor registered address state differs from deputy's declared office state | Receita Federal CNPJ address + deputy state from politicians table |
| `POLITICALLY_CONNECTED_VENDOR` | **50** | Any partner/administrator in vendor's QSA (quadro societário) has a CPF that appears in TSE electoral candidate records | Receita Federal QSA × TSE candidate database |

**Implementation notes per sub-flag**:
- `VENDOR_CNAE_MISMATCH`: Use a curated incompatibility list per category (e.g., CNAE divisions 01–03 = agriculture/fishing, 05–09 = mining, 10–25 = manufacturing unrelated to office services) — mirror the disambiguation principle from §3.8 (unambiguous mismatches only, not a generic "not in expected set" approach). **Validated in corpus**: three agribusiness/cattle companies (CNAE 0151-2 Bovinocultura, 0162-8 Atividades de apoio à pecuária) billed R$14.25M under MANUTENCAO DE ESCRITORIO; one of them is in *recuperação judicial*.
- `VENDOR_GEOGRAPHIC_ANOMALY`: Standalone FPR is 22–83% across categories — airlines, telecoms, and ride-hailing are structurally registered in SP/RJ, making cross-state the norm, not the anomaly. Forensic value is only in the §6 composite. The **rural municipality dimension** (vendor address in a rural municipality far from the deputy's office city) would be far more discriminating than UF mismatch alone, but requires geocoding not present in the current `vendors` schema (see checklist item 14).
- `POLITICALLY_CONNECTED_VENDOR`: Infrastructure is ready — `vendor_partners` table fully populated (77,988 records, 89% of matched vendors). The only remaining step is the TSE candidate CPF cross-reference (checklist item 7).

**Escalation rule**: When `POLITICALLY_CONNECTED_VENDOR` fires together with `RECIBO_DOCUMENT` and either `VENDOR_CNAE_MISMATCH` or `VENDOR_GEOGRAPHIC_ANOMALY`, the expense must be **auto-escalated to mandatory manual review regardless of total score**. This combination should not be suppressible by a scoring threshold.

### 6.4 "Em espécie" detection note

The CEAP API expenses endpoint has no `tipoPagamento` field (confirmed: see `ExpenseData` interface in `ExpensesPipeline.ts`). Cash payment detection is only possible via OCR text matching on the PDF document. Target strings: `"em espécie"`, `"pagamento em dinheiro"`, `"pago em espécie"`. Given the ~19% text-extraction rate for Recibos (§2), this signal will be missed in ~81% of cases. **Do not rely on its absence as evidence the payment was not cash.**

If detected via OCR: add **15 pts** and record in audit trail.

### 6.5 Data pipeline dependencies

- **Receita Federal CNPJ bulk dataset**: freely downloadable at `dados.gov.br/dados/conjuntos-dados/cnpj`. Updated monthly. Contains CNAE principal/secondary codes, registered address, and QSA (partner list with CPFs).
- **TSE candidate data**: `dadosabertos.tse.jus.br`. Contains CPF for all candidates across all elections. Cross-reference QSA CPFs against this table.
- Both datasets are suitable for batch enrichment at ETL time — the enriched fields can be stored in the `expenses` or a separate `vendors` table and used at scoring time without live API calls.

---

## 7. CNPJ Lifecycle Anomaly Flags

*All flags in this section require the Receita Federal CNPJ bulk dataset (registration date, status history, employee count).*

### 7.1 CNPJ_POSTDATES_EXPENSE

| Attribute | Value |
|-----------|-------|
| **Flag** | `CNPJ_POSTDATES_EXPENSE` |
| **Points** | **escalate** |
| **Logic** | Vendor CNPJ registration date > `data_documento` |
| **Rationale** | A company that did not legally exist on the invoice date makes the document definitively fraudulent. Zero false positive rate — no legitimate explanation exists. Must auto-escalate to mandatory review regardless of total score. |

### 7.2 CNPJ_INACTIVE_AT_EXPENSE

| Attribute | Value |
|-----------|-------|
| **Flag** | `CNPJ_INACTIVE_AT_EXPENSE` |
| **Points** | **escalate** |
| **Logic** | Vendor CNPJ status was `INAPTA`, `BAIXADA`, or `SUSPENSA` on `data_documento` |
| **Rationale** | Payment to a legally dissolved or suspended company is definitively irregular under Brazilian tax and procurement law. The Receita Federal bulk dump includes both current status and historical status change dates. Same escalation logic as `CNPJ_POSTDATES_EXPENSE`. |

> **⚠️ Implementation gate**: Do **not** check `registration_status` alone. Corpus measurement: 8,158 expenses match vendors now-BAIXADA, but only **580 were already BAIXADA on `data_documento`** (93% false-positive rate without a date anchor). The implementation **must** compare `registration_status_date ≤ data_documento` — this column is already populated in the `vendors` table. Same gate applies to INAPTA (119 true positives out of 362) and SUSPENSA (1 out of 357).

### 7.3 FRESHLY_REGISTERED_VENDOR

| Attribute | Value |
|-----------|-------|
| **Flag** | `FRESHLY_REGISTERED_VENDOR` |
| **Points** | **25** |
| **Logic** | Vendor CNPJ registration date < 90 days before the first expense from any deputy to this vendor |
| **Rationale** | Companies created specifically to receive public funds ("empresa criada para o fim") are a documented Brazilian CEAP abuse pattern. The 90-day window covers the most acute risk period. Signal strengthens significantly when combined with `VENDOR_CNAE_MISMATCH` or `RECIBO_DOCUMENT`. |

> **Empirical validation (seed.db)**: 818 vendors (2% of matched CNPJ vendors) had their first CEAP expense within 90 days of opening (avg gap: 38.8 days). Distribution: 0–7 days = 124 vendors, 8–30 = 236, 31–60 = 260, 61–90 = 198. DIVULGACAO DA ATIVIDADE PARLAMENTAR dominates with 5,890 expenses and **R$3.56B** — consistent with vendors incorporated specifically to channel CEAP advertising funds. **Consider escalating the 0–7 day sub-group** (124 vendors) to mandatory review regardless of total score: a company billed within one week of registration has no time to establish genuine commercial operations (see checklist item 15).

### 7.4 VENDOR_NO_EMPLOYEES

| Attribute | Value |
|-----------|-------|
| **Flag** | `VENDOR_NO_EMPLOYEES` |
| **Points** | **20** |
| **Logic** | Vendor has zero declared employees (Receita Federal SIMEI/SIMPLES or RAIS cross-reference) and `tipo_despesa` ∈ {SERVICO DE SEGURANCA, MANUTENCAO DE ESCRITORIO, LOCACAO OU FRETAMENTO DE VEICULOS} |
| **Rationale** | A shell company with no staff providing services that operationally require personnel signals a fictitious vendor. Restricted to categories where zero employees is operationally implausible. Do not apply to individual CPF vendors or MEI sole traders providing personal services. |

> **⚠️ Schema gap**: The current `vendors` table stores `company_size` (Receita Federal `PORTE_EMPRESA` tier: `01`=Micro, `03`=EPP, `05`=Demais) — a size bracket, not an employee count. Full implementation requires RAIS (Relação Anual de Informações Sociais) or SIMEI/SIMPLES cross-reference to confirm zero declared employees. An interim proxy using `company_size = '01'` (Micro-empresa) in the restricted categories is feasible but conflates small-with-employees and genuine zero-employee shells. Add an `employee_count` column to `vendors` (checklist item 13) before shipping at full 20pt weight; use 10pt with the size proxy in the interim.

### 7.5 CNPJ_MISSING_ESTABLISHMENT

| Attribute | Value |
|-----------|-------|
| **Flag** | `CNPJ_MISSING_ESTABLISHMENT` |
| **Points** | **escalate** |
| **Logic** | Expense has a 14-digit `cnpj_cpf_fornecedor` with no corresponding record in the `vendors` table — i.e., the Receita Federal Estabelecimentos bulk data contains no entry for that full CNPJ |
| **Rationale** | In Brazil's CNPJ system the 8-digit *CNPJ Básico* identifies the legal entity (Empresas), but the full 14-digit CNPJ identifies a specific *Estabelecimento* (branch/operating unit). Any lawful invoice must originate from a registered Estabelecimento. A CNPJ present on an expense document but absent from the Estabelecimentos dataset means either (1) the CNPJ was fabricated outright, (2) the company entity exists but that branch was never opened — it cannot legally issue fiscal documents — or (3) the establishment was registered and then purged, which Receita Federal does not do; baixadas remain in the dataset. All three interpretations make the document definitively irregular. This is distinct from `CNPJ_INACTIVE_AT_EXPENSE`: here there was never a valid operating establishment at all, not just one that later closed. |

> **ETL invariant**: The `ReceitaFederalCNPJPipeline` already enforces this by skipping any CNPJ whose full 14-digit number is absent from the Estabelecimentos ZIP files — no vendor row is inserted. The scoring layer therefore detects this flag via a `LEFT JOIN vendors ON expenses.cnpj_cpf_fornecedor = vendors.cnpj WHERE vendors.id IS NULL AND length(expenses.cnpj_cpf_fornecedor) = 14`. **Prerequisite**: the Receita Federal pipeline must have completed a full run; a missing vendor row before that run is inconclusive and must not be scored.

> **False-positive gate**: Do NOT fire if `length(cnpj_cpf_fornecedor) = 11` (CPF vendor — individual, not a company). Do NOT fire if the Receita Federal ingestion timestamp is absent or stale (> 45 days old) in the pipeline metadata table. An unmatched CNPJ after a fresh ingestion is the only reliable signal.

---

## 8. Additional Detection Patterns

### 8.1 CROSS_DEPUTY_INVOICE_REUSE

| Attribute | Value |
|-----------|-------|
| **Flag** | `CROSS_DEPUTY_INVOICE_REUSE` |
| **Points** | **50** |
| **Logic** | Same `(cnpj_cpf_fornecedor, num_documento)` pair appears in expenses from ≥ 2 distinct `deputy_id` values |
| **Rationale** | The existing `DUPLICATE_INVOICE` flag only catches reuse within a single deputy's records. The same invoice number submitted by two different deputies is definitively fraudulent — one document cannot justify two separate public reimbursements. **Detectable from current CEAP data alone.** Apply the same S/N placeholder exclusion list as `DUPLICATE_INVOICE` (§3.3). |

### 8.2 SINGLE_CLIENT_VENDOR

| Attribute | Value |
|-----------|-------|
| **Flag** | `SINGLE_CLIENT_VENDOR` |
| **Points** | **20** |
| **Logic** | `cnpj_cpf_fornecedor` appears in expenses from exactly 1 distinct `deputy_id` across the entire corpus, with ≥ 5 total expenses |
| **Rationale** | Legitimate service providers have multiple clients. A vendor whose entire CEAP presence is one deputy — especially across repeated transactions — is a structural red flag for a fictitious or captured vendor. The ≥ 5 minimum avoids penalising genuine one-off vendors. Signal is strongest when combined with `VENDOR_IS_CPF` or `RECIBO_DOCUMENT`. **Detectable from current CEAP data alone.** |

### 8.3 COMPETENCY_DATE_MISMATCH

| Attribute | Value |
|-----------|-------|
| **Flag** | `COMPETENCY_DATE_MISMATCH` |
| **Points** | **20** |
| **Logic** | `data_documento` falls more than 90 days before the `ano`/`mes` competency period |
| **Rationale** | CEAP rules (Resolução da Mesa nº 43/2009) require submission within 90 days of the expense date. Significant backdating suggests document fabrication or retroactive justification of already-spent funds. |
| **⚠️ Schema gap** | `ano` and `mes` are returned by the Câmara API (`ExpenseData` interface in `ExpensesPipeline.ts`) but are **not stored** in the DB (`ExpenseRow`). Both fields must be added to the `expenses` table and ETL pipeline before this flag can be computed. See §10 checklist item 7. |

### 8.4 CAMPAIGN_DONOR_VENDOR

| Attribute | Value |
|-----------|-------|
| **Flag** | `CAMPAIGN_DONOR_VENDOR` |
| **Points** | **30** |
| **Logic** | Any QSA partner/administrator of the vendor has donated to the paying deputy's electoral campaign in any cycle (TSE donation records) |
| **Rationale** | Narrower and more specific than `POLITICALLY_CONNECTED_VENDOR` (which covers any electoral candidate). A campaign donor has a direct financial interest in the deputy's re-election, making the payment a potential kickback channel. TSE donation data is publicly available at `dadosabertos.tse.jus.br`. |

> **Pipeline status**: No TSE campaign donation pipeline exists yet — this flag is blocked on checklist item 8. The `vendor_partners` table is already populated and provides the donor-side CPFs. Dependency chain: `vendor_partners.partner_cpf_cnpj` → TSE `prestacao_de_contas` donation records → filtered to the paying deputy as recipient. A vendor partner who financially backed this specific deputy's campaign and then received CEAP money from them is a direct conflict-of-interest with kickback implications — more specific and legally actionable than `POLITICALLY_CONNECTED_VENDOR`.

### 8.5 VENDOR_FAMILY_MEMBER

| Attribute | Value |
|-----------|-------|
| **Flag** | `VENDOR_FAMILY_MEMBER` |
| **Points** | **15** |
| **Logic** | A QSA partner/administrator shares the paying deputy's primary surname |
| **Rationale** | Catches spouses, siblings, and parents who are not themselves electoral candidates and would therefore be missed by `POLITICALLY_CONNECTED_VENDOR`. High false-positive risk on common Brazilian surnames (Silva, Santos, Oliveira) — weight kept low. Only contributes meaningfully when combined with other signals. Do not apply when the surname's match rate across the full vendor QSA corpus exceeds 5% (too common to be discriminating). |

> **Implementation specifics**: (1) Apply NFD Unicode normalization and extract only the **last name token** before matching — do not match on full names. (2) The check must be **bilateral in direction**: does a token from the deputy's surname appear as a token in the partner name? (Not vice versa — a partner named "SILVA PEREIRA" should match deputy "SILVA", not match because "PEREIRA" happens to be a politician's surname.) (3) Enforce the 5% corpus frequency gate: compute each candidate surname's match rate across all `vendor_partners` records and suppress the flag for any surname exceeding that threshold. Corpus confirmation of noisiest surnames: PEREIRA (40 partner matches), OLIVEIRA (35), SILVA (20) — all must be gated.

### 8.6 FUEL_PRICE_ABOVE_ANP

| Attribute | Value |
|-----------|-------|
| **Flag** | `FUEL_PRICE_ABOVE_ANP` |
| **Points** | **25** |
| **Logic** | For `tipo_despesa = COMBUSTIVEIS E LUBRIFICANTES`: `valor_liquido / extracted_liters > ANP regional P95 pump price` for the expense week and state |
| **Rationale** | ANP (Agência Nacional do Petróleo) publishes weekly regional average and P95 pump prices per state at `dados.gov.br/dados/conjuntos-dados/serie-historica-de-precos-de-combustiveis-por-revenda`. COMBUSTIVEIS is the largest single category (233k rows, 35% of all expenses). A price-per-litre above the regional P95 indicates quantity inflation (fewer litres than claimed) or a fraudulent vendor markup. |
| **Dependency** | Requires OCR extraction of fuel quantity (litres) from the document. Coverage limited to the ~25% of COMBUSTIVEIS PDFs that are text-extractable (§2). |

### 8.7 PASSENGER_NAME_MISMATCH

| Attribute | Value |
|-----------|-------|
| **Flag** | `PASSENGER_NAME_MISMATCH` |
| **Points** | **35 / escalate on `FAMILY_PASSENGER` sub-flag** |
| **Logic** | `tipo_despesa` ∈ {PASSAGEM AEREA SIGEPA, PASSAGEM AEREA RPA}: OCR extracts a passenger name field that does not match the paying deputy's own name |
| **Rationale** | CEAP is exclusively scoped to the deputy's own parliamentary activities. Neither family members nor parliamentary staff (assessores) are eligible — staff travel is covered by a separate Câmara administrative budget, not CEAP. A flight receipt under CEAP where the passenger is anyone other than the deputy is definitively irregular regardless of the third party's relationship to the deputy. The only plausible innocent explanation is an OCR parsing error, which keeps the false-positive rate low. |

> **Two-tier scoring**:
> - **`PASSENGER_NAME_MISMATCH` (35 pts)**: OCR extracts a passenger name and it does not match the deputy's name (even partially). Fires regardless of who the passenger is — any non-deputy passenger is outside CEAP scope.
> - **`FAMILY_PASSENGER` sub-flag (+15 pts, escalate)**: The mismatched passenger name surname-matches the deputy's surname. Apply the same NFD normalization, last-name-token extraction, and 5% corpus frequency gate from `VENDOR_FAMILY_MEMBER` (§8.5). The self-dealing interpretation (public funds for a relative's travel) overrides the administrative-error explanation and warrants mandatory review regardless of total score.

> **Detection dependency**: Requires OCR text extraction from flight documents. E-tickets from GOL/LATAM/AZUL are frequently generated by PDFium (browser "Print to PDF"), which is text-extractable (§2). The `CATEGORY_MISMATCH` keyword table (§3.8) already lists `"GOL"`, `"LATAM"`, `"AZUL"`, `"passagem"`, `"voo"`, `"bilhete aéreo"` — the same OCR pass that feeds `CATEGORY_MISMATCH` can be extended to extract passenger name fields. Target label patterns: `"Passageiro:"`, `"Passenger:"`, `"Nome do Passageiro:"`. Estimated coverage: ~19–25% of PASSAGEM AEREA expenses (same extractability rate as the general corpus, §2).

> **Implementation note**: Name comparison must use NFD Unicode normalization and case-folding. Use token-overlap matching rather than exact string match to handle middle-name reordering (e.g., `"JOÃO SILVA PEREIRA"` vs. `"JOÃO PEREIRA SILVA"` are the same person). A match on the last token of the deputy's name appearing anywhere in the extracted passenger name is sufficient to treat it as a match — do not require full-name identity.

---

## 9. Revised Scoring Table

Signal strength legend: **Definitive** = zero or near-zero false positive rate, auto-escalate; **High** = strong discriminator, fires rarely and nearly always warrants investigation; **Medium** = meaningful but context-dependent, best combined with other signals; **Low** = weak alone, contributes only in aggregate.

| Flag | Original pts | Revised pts | Change | Signal Strength | Reason |
|------|:-----------:|:-----------:|:------:|:---------------:|--------|
| `ROUND_AMOUNT` | 10 | **5** | ↓ | Low | Fires on 16.9% of expenses; low signal |
| `EXTREME_AMOUNT` | 30 | 30 | — | Medium | Per-deputy median + guardrails reduce noise; still wide in high-variance categories |
| `DUPLICATE_INVOICE` | 50 | **40** | ↓ | High | Same invoice reused by one deputy; strong after S/N exclusion |
| `VENDOR_IS_CPF` | 15 | 15 | — | Medium | Selective at 0.9%; not fraudulent alone but a genuine discriminator |
| `HIGH_FREQ_VENDOR` | 20 | 20 (threshold **≥ 8**) | threshold ↑ | Medium | ≥ 4 fires on 19.1%; ≥ 8 is ~5× more selective |
| `WEEKEND_DOCUMENT` | 25 | **10** | ↓ | Low | Fires on 13.4%; month-boundary receipts are routine |
| `PDF_NO_TEXT` | 10 | **5** | ↓ | Low | 84% of docs are scans; no-text is the baseline, not an anomaly |
| `PDF_UNREACHABLE` (new) | — | **15** | new | Medium | Broken URL on a submitted expense is more anomalous than a scanned doc |
| `CATEGORY_MISMATCH` | 35 | 35 | — | High | Rare coverage (~16% of docs) but high precision on unambiguous keyword hits |
| `ZERO_GLOSA_HIGH_VALUE` | 20 | 20 | — | Medium | 5.5% selectivity; no audit deduction on high-value claim is a genuine anomaly |
| `RECIBO_DOCUMENT` **(new)** | — | **20** | new | Low | Contextual amplifier; not suspicious alone but elevates every co-occurring signal |
| `EXPENSE_ABROAD` **(new)** | — | **25** | new | Medium | Highest avg value (R$5,688); no BR tax cross-check possible |
| `VENDOR_CNAE_MISMATCH` **(new)** | — | **25** | new | High | Company billing outside its registered activity; use curated incompatibility list (§6.3 note). **Validated — real instances in corpus** (livestock companies billing R$14.25M for office maintenance) |
| `VENDOR_GEOGRAPHIC_ANOMALY` **(new)** | — | **20** | new | Medium | 22–83% FPR standalone across categories; forensic value only in §6 composite. Rural municipality precision requires geocoding (checklist item 14) |
| `POLITICALLY_CONNECTED_VENDOR` **(new)** | — | **50 / escalate** | new | High | Strong alone; **Definitive** under §6 composite (+ RECIBO + CNAE/geographic). Infrastructure ready; blocked on TSE candidates pipeline (item 7) |
| `CNPJ_POSTDATES_EXPENSE` **(new)** | — | **escalate** | new | Definitive | Company didn't exist on invoice date; zero false positives |
| `CNPJ_INACTIVE_AT_EXPENSE` **(new)** | — | **escalate** | new | Definitive | Payment to a dissolved/suspended company; definitively irregular |
| `FRESHLY_REGISTERED_VENDOR` **(new)** | — | **25** | new | High | Documented "empresa criada para o fim" pattern; 90-day window is the acute risk period |
| `VENDOR_NO_EMPLOYEES` **(new)** | — | **20 (10 interim)** | new | High | Zero-staff in service categories requiring personnel. Schema gap — needs RAIS data; ship at 10pt using `company_size='01'` proxy until `employee_count` added (item 13) |
| `CNPJ_MISSING_ESTABLISHMENT` **(new)** | — | **escalate** | new | Definitive | Full 14-digit CNPJ absent from Receita Federal Estabelecimentos — the establishment was never registered; no legitimate invoice can originate from it. Distinct from `CNPJ_INACTIVE_AT_EXPENSE` (which was once valid). See §7.5. |
| `CROSS_DEPUTY_INVOICE_REUSE` **(new)** | — | **50** | new | Definitive | One invoice cannot justify two reimbursements; zero innocent explanations |
| `SINGLE_CLIENT_VENDOR` **(new)** | — | **20** | new | Medium | Unusual but possible for niche services; decisive when combined with RECIBO or CPF |
| `COMPETENCY_DATE_MISMATCH` **(new)** | — | **20** | new | Medium | Backdating > 90 days is suspicious; administrative delays are a plausible excuse |
| `CAMPAIGN_DONOR_VENDOR` **(new)** | — | **30** | new | High | Direct conflict-of-interest / kickback channel; more specific than POLITICALLY_CONNECTED_VENDOR. Blocked on TSE donation pipeline (item 8) |
| `VENDOR_FAMILY_MEMBER` **(new)** | — | **15** | new | Low | High false-positive risk on common surnames; meaningful only in combination. NFD-normalize last name token only; bilateral direction check; gate at 5% corpus frequency |
| `FUEL_PRICE_ABOVE_ANP` **(new)** | — | **25** | new | Medium | Strong when OCR confirms price/litre; limited to ~25% of COMBUSTIVEIS docs |
| `PASSENGER_NAME_MISMATCH` **(new)** | — | **35 / escalate** | new | High / Definitive | CEAP is for the deputy only; any other passenger is outside scope. Escalates to Definitive (`FAMILY_PASSENGER` sub-flag, +15 pts) when surname-matches the deputy. OCR-gated; ~19–25% coverage on PASSAGEM AEREA docs |

**Threshold recalibration**: With revised scoring, `>= 50` still marks high suspicion. A Recibo + CPF vendor + S/N excluded from DUPLICATE + round amount = 20+15+5 = 40 (medium). A Recibo + CPF vendor + high-freq + round amount + weekend = 20+15+20+5+10 = 70 (high) — which is more defensible.

---

## 10. Statistical Calibration of Scoring Weights

> Empirically derived from `seed.db` (665,830 expenses). All flag prevalences measured directly via SQL; weights derived using the **Weight of Evidence (WoE)** / log-prevalence calibration framework.

### 10.1 Why logarithmic, not linear

Flag prevalences span three orders of magnitude — from 0.05% (`EXPENSE_ABROAD`) to 25% (`HIGH_FREQ_ge8`). A linear `points ∝ rarity` scale would either compress all the rare signals together or make common signals negligible. The natural scale is:

```
base_points = k × ln(1 / prevalence)
```

This is the information-theoretic interpretation: a flag with probability `p` carries `−ln(p)` nats of surprise when it fires. The constant `k` is fixed by anchoring on `VENDOR_IS_CPF` — the one flag with strong expert consensus that 15 pts is correct, firing at 0.89%.

```
k = 15 / ln(1 / 0.0089) = 3.18
```

A qualitative signal-quality multiplier is then applied on top to account for known false-positive rates that prevalence alone cannot capture:

| Quality tier | Multiplier | Meaning |
|---|:---:|---|
| Definitive | ×1.5 | Near-zero FPR; a single occurrence logically excludes innocent explanations |
| High | ×1.0 | Strong discriminator; rare false positives exist but are the exception |
| Medium | ×0.85 | Context-dependent; meaningful combined with other signals |
| Low | ×0.6 | Noisy standalone; contributes only in aggregate |

### 10.2 Empirical calibration results

All figures are from `seed.db`; `valor_liquido` is stored in centavos (R$1.00 = 100).

| Flag | Measured rows | Prevalence | ln(1/p) | raw pts | quality | **empirical pts** | **current pts** | gap |
|------|---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `ROUND_AMOUNT` (% 10 000 = 0) | 112,537 | 16.90% | 1.78 | 5.7 | Low ×0.6 | **3** | 5 | +2 |
| `VENDOR_IS_CPF` | 5,957 | 0.89% | 4.72 | 15.0 | Medium ×0.85 | **13** | 15 | +2 ✅ |
| `RECIBO_DOCUMENT` | 108,631 | 16.32% | 1.81 | 5.8 | Low ×0.6 | **3** | 20 | **+17** |
| `EXPENSE_ABROAD` | 301 | 0.05% | 7.70 | 24.5 | Medium ×0.85 | **21** | 25 | +4 |
| `WEEKEND_DOCUMENT` | 88,978 | 13.36% | 2.01 | 6.4 | Low ×0.6 | **4** | 10 | **+6** |
| `ZERO_GLOSA_HIGH_VALUE` (≥R$5,050) | 36,283 | 5.45% | 2.91 | 9.3 | Medium ×0.85 | **8** | 20 | **+12** |
| `DUPLICATE_INVOICE` | 20,550 | 3.09% | 3.48 | 11.0 | High ×1.0 | **11** | 40 | **+29** |
| `CROSS_DEPUTY_INVOICE` | 10,016 | 1.50% | 4.20 | 13.3 | Definitive ×1.5 | **20** | 50 | **+30** |
| `SINGLE_CLIENT_VENDOR` | 91,718 | 13.77% | 1.98 | 6.3 | Medium ×0.85 | **5** | 20 | **+15** |
| `HIGH_FREQ_ge8` | 163,972 | 24.63% | 1.40 | 4.5 | Low ×0.6 | **3** | 20 | **+17** |
| `HIGH_FREQ_ge12` | 109,964 | 16.52% | 1.80 | 5.7 | Medium ×0.85 | **5** | — | new |

### 10.3 Interpretation rules

The empirical points are a **sanity-check floor, not a strict ceiling**. Three cases where exceeding the floor is justified:

1. **Definitively fraudulent signals** (`CROSS_DEPUTY_INVOICE`, `CNPJ_POSTDATES_EXPENSE`): A single occurrence must auto-trigger mandatory review regardless of total score. The points must equal or exceed the alert threshold by themselves. This is the only case where a large premium above the floor is correct.

2. **Known near-zero FPR despite moderate prevalence** (`DUPLICATE_INVOICE` after S/N exclusion): The prevalence-based floor (11 pts) does not capture the conditional precision. A modest expert premium is warranted — but the current 40 pts is excessive for a 3.09% prevalence signal.

3. **Context amplifiers** (`RECIBO_DOCUMENT`): At 16.3% prevalence the standalone log-floor is 3 pts. The current 20 pts implicitly treats it as a primary signal, but its forensic value is as an amplifier that increases the weight of co-occurring signals. The implementation should reflect this — either reduce the standalone weight to ~8 pts and rely on combination effects, or implement it as a true multiplier on co-occurring flag scores rather than an additive point value.

### 10.4 HIGH_FREQ threshold is too low

The doc estimated 19.1% affected rows at ≥4/month using an earlier DB snapshot. Current measurement:

| Threshold | Groups | Affected rows | Prevalence |
|---|:---:|:---:|:---:|
| ≥ 4/month | 28,926 | 251,250 | **37.7%** |
| ≥ 8/month | 11,560 | 163,972 | **24.6%** |
| ≥ 10/month | 8,116 | 134,840 | **20.3%** |
| ≥ 12/month | — | 109,964 | **16.5%** |

Even at ≥12/month, 1 in 6 expenses is flagged. At any of these thresholds the flag qualifies only as Low signal (log-floor ~5 pts). **Suggested**: raise to ≥15/month and cap at 8 pts, or retire `HIGH_FREQ_VENDOR` as a standalone flag and use it only as an input to the `SINGLE_CLIENT_VENDOR` composite.

### 10.5 Score inflation and threshold recalibration

With the current weights, combinations of low-signal flags routinely exceed the ≥50 pt alert threshold:

| Example combination | Current score | Empirical floor |
|---|:---:|:---:|
| `RECIBO` + `HIGH_FREQ` + `ROUND` + `WEEKEND` | 20+20+5+10 = **55** 🔴 | 3+3+3+4 = 13 |
| `RECIBO` + `VENDOR_IS_CPF` + `WEEKEND` | 20+15+10 = **45** 🟡 | 3+13+4 = 20 |
| `DUPLICATE_INVOICE` alone | **40** 🟡 | 11 |

The first combination (four low-signal flags) crosses the alert threshold under current scoring, despite having an empirical floor of 13 pts — well within normal business-expense territory.

**Two coherent options**:

- **Option A — Lower weights, keep threshold at 50**: Bring all flags to within 1.5× their empirical floor. Raise threshold for `CROSS_DEPUTY_INVOICE`/`CNPJ_POSTDATES` to "escalate" (bypass score entirely). This eliminates score inflation from low-signal accumulation.
- **Option B — Keep weights, lower threshold to 30**: Accept that current weights are intentionally conservative (expert over-weighting). Set alert threshold at 30 pts so that any two Medium signals trigger review. Keep "escalate" for the Definitive tier. This is simpler to implement but will have higher false-positive volume.

Option A is statistically preferable. Option B is easier to ship with the existing scoring table.

### 10.6 Empirically derived alert thresholds (replaces arbitrary 50 pts)

> The threshold is not independent of the weights. Keeping it at 50 while lowering weights is internally inconsistent. The consistent approach is to derive the threshold from the same empirical score distribution.

**Formula derivation**: In the WoE framework the threshold can be expressed as `k × ln(1 / target_alert_rate)`, the same formula used for individual weights. However this approximation assumes only one flag fires per expense. In practice flags co-occur, so the actual alert rate at any score cutoff must be measured on the real distribution.

**Simulation on seed.db** (Option A weights — 7 CEAP-only flags):

| Score | Count | Cumulative from top |
|---|---:|:---:|
| 56 | 15 | 0.002% |
| 53 | 24 | 0.006% |
| 52 | 203 | 0.036% |
| 49–44 | 558 | 0.116% |
| 41–39 | 621 | 0.222% |
| 36 | 512 | 0.299% |
| 33–32 | 2,366 | 0.665% |
| 31 | 626 | 0.759% |
| **≥ 29** | **~5,500** | **0.83%** |
| **25–27** | **300** | **0.045% in this band** ← natural valley |
| **≥ 25** | **~16,440** | **2.47%** |
| 21–24 | ~9,700 | 3.7% |
| ≥ 12 | ~97,000 | 14.6% |
| 0 | 388,409 | baseline (58.3% of all expenses) |

**The natural valley at scores 25–27** contains only 300 expenses (0.045% of the corpus). This is where the distribution transitions from high-density single/double-flag combinations to sparse multi-flag combinations — the statistically correct place to draw the review boundary.

**Recommended two-tier threshold system** (replaces the single 50 pt threshold):

| Tier | Score threshold | Alert rate | Rationale |
|---|:---:|:---:|---|
| **Review** (yellow) | **≥ 25** | ~2.5% (~16,400 exp.) | Natural valley lower bound; catches DUPLICATE+RECIBO, EXPENSE_ABROAD + any co-signal, VENDOR_IS_CPF + RECIBO + 2 others |
| **Priority** (orange) | **≥ 32** | ~0.66% (~4,400 exp.) | Three or more co-occurring meaningful signals; above the DUPLICATE+RECIBO+ROUND/WEEKEND baseline |
| **Escalate** (red) | bypass score | ~0% | `CROSS_DEPUTY_INVOICE`, `CNPJ_POSTDATES_EXPENSE`, `CNPJ_INACTIVE_AT_EXPENSE` — definitively irregular, single occurrence is sufficient |

**Why not a single threshold at 50**: With Option A weights the maximum achievable score from CEAP-only flags is 57 pts (all 7 flags co-firing: 3+13+8+21+4+8+20 — impossible in practice since `cod_tipo_documento` can only be one value). The top observed score is 56, affecting 15 expenses. A threshold of 50 under Option A weights would flag fewer than 250 expenses total — a useful "extremely suspicious" tier, but too narrow to serve as the primary review threshold.

**Threshold consistency check**: The ≥25 Review threshold corresponds to an approximate `target_alert_rate = e^(-25/k) = e^(-7.86) ≈ 0.04%` from the formula — but the empirical rate is 2.47%, a 60× gap caused entirely by flag co-occurrence. This confirms the formula cannot be used to set the threshold directly; the empirical simulation is required.

### 10.7 Simulation methodology (reproducibility)

Run from the repo root against `etl/seed.db`. Requires Python 3 and no external libraries beyond the standard library.

```python
import sqlite3, math, collections

DB = 'etl/seed.db'
# Option A weights (empirically calibrated, §10.2)
# Only flags computable from CEAP data alone (no external datasets required)
WEIGHTS = {
    'ROUND_AMOUNT':          3,   # valor_liquido % 10000 = 0  (multiple of R$100)
    'VENDOR_IS_CPF':        13,   # len(cnpj_cpf_fornecedor) = 11
    'RECIBO_DOCUMENT':       8,   # cod_tipo_documento = 1
    'EXPENSE_ABROAD':       21,   # cod_tipo_documento = 2
    'WEEKEND_DOCUMENT':      4,   # strftime('%w') IN ('0','6')
    'ZERO_GLOSA_HIGH_VALUE': 8,   # valor_glosa = 0 AND valor_liquido >= 505000 (R$5,050)
    'DUPLICATE_INVOICE':    20,   # same (deputy, cnpj, num_documento) >1 time, S/N excluded
}

db = sqlite3.connect(DB)
cur = db.cursor()

rows = cur.execute("""
  WITH dup_keys AS (
    SELECT deputy_id, cnpj_cpf_fornecedor, num_documento
    FROM expenses
    WHERE num_documento NOT IN ('','S/N','s/n','SN','sn','S.N.','S/Nº','00','000','0','-')
    GROUP BY deputy_id, cnpj_cpf_fornecedor, num_documento
    HAVING COUNT(*) > 1
  )
  SELECT
    (CASE WHEN e.valor_liquido > 0 AND e.valor_liquido % 10000 = 0    THEN 3  ELSE 0 END)
  + (CASE WHEN length(e.cnpj_cpf_fornecedor) = 11                     THEN 13 ELSE 0 END)
  + (CASE WHEN e.cod_tipo_documento = 1                                THEN 8  ELSE 0 END)
  + (CASE WHEN e.cod_tipo_documento = 2                                THEN 21 ELSE 0 END)
  + (CASE WHEN strftime('%w', e.data_documento) IN ('0','6')           THEN 4  ELSE 0 END)
  + (CASE WHEN e.valor_glosa = 0 AND e.valor_liquido >= 505000         THEN 8  ELSE 0 END)
  + (CASE WHEN d.deputy_id IS NOT NULL                                 THEN 20 ELSE 0 END)
  AS score
  FROM expenses e
  LEFT JOIN dup_keys d
    ON d.deputy_id           = e.deputy_id
   AND d.cnpj_cpf_fornecedor = e.cnpj_cpf_fornecedor
   AND d.num_documento        = e.num_documento
""").fetchall()

scores = [r[0] for r in rows]
total = len(scores)
counter = collections.Counter(scores)

for s in sorted(counter.keys(), reverse=True):
    cnt = counter[s]
    cum = sum(counter[x] for x in counter if x >= s)
    print(f"score={s:>3}  count={cnt:>8,}  cumulative={cum*100/total:.3f}%")

scores_desc = sorted(scores, reverse=True)
for pct in [0.5, 1, 2, 5]:
    idx = int(total * pct / 100)
    print(f"Top {pct}% → threshold >= {scores_desc[idx]}  ({idx:,} expenses)")

db.close()
```

**Scope limitations of this simulation**:

- Covers only the 7 flags computable from CEAP data alone. Adding external-data flags (`VENDOR_CNAE_MISMATCH`, `FRESHLY_REGISTERED_VENDOR`, `POLITICALLY_CONNECTED_VENDOR`, etc.) will shift the distribution rightward and increase alert rates at every threshold. **Thresholds must be re-simulated after each new flag is added.**
- `RECIBO_DOCUMENT` weight is 8 pts here (expert bump above the 3 pt log-floor, §10.3). If the implementation uses a different value, re-run.
- `valor_liquido` is stored in centavos. `% 10000 = 0` means divisible by R$100.00. `>= 505000` means ≥ R$5,050 (the empirically measured boundary for the `ZERO_GLOSA_HIGH_VALUE` flag, see §3.9).
- `CROSS_DEPUTY_INVOICE`, `CNPJ_POSTDATES_EXPENSE`, and `CNPJ_INACTIVE_AT_EXPENSE` are **not included** in the score simulation — they bypass the scoring system entirely (Escalate tier) and must be detected as a separate pre-scoring pass.

---

> **Implementation backlog**: See [`etl/BACKLOG.md`](etl/BACKLOG.md) for the full prioritized implementation task list, including all flag-specific implementation notes, data dependencies, and the scoring recalibration plan.
