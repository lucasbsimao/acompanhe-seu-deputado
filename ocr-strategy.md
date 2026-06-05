# OCR Strategy for ExpenseDocumentAnalysisPipeline

> Document analysis and technology selection for extracting text from CEAP expense documents.

---

## 1. Current Reality Check

### Direct text extraction rate

| Document type | `cod_tipo_documento` | Direct extractable rate |
|---------------|:--------------------:|------------------------:|
| Nota Fiscal | 0 | ~25% |
| Recibos/Outros | 1 | **~19%** |
| Despesa no Exterior | 2 | ~6.7% |

**Key insight**: 81% of Recibos (108k documents, 16% of corpus) and 75% of Notas Fiscais are scanned/image-based PDFs. The `pdf-parse → OCR fallback` architecture is correct, but OCR should be considered the **primary path** for Recibos rather than a fallback.

---

## 2. Technology Decision: Classic OCR vs Deep Learning

### Why not Tesseract alone

Tesseract was designed for clean, printed text. Brazilian CEAP receipts suffer from:
- Varied fonts, stamps, and handwriting overlay
- Low-resolution mobile/scanner output
- Degraded paper quality
- Mixed-language content (Portuguese + vendor codes)

Tesseract accuracy degrades significantly on these conditions.

### Deep Learning recommendation

| Tool | VRAM (3050 4GB) | Pros | Cons |
|------|-----------------|------|------|
| **Surya** | ~1–2GB | Document-native, multi-page, excellent multilingual | Python-only |
| docTR | ~500MB–1GB | Good receipt/invoice focus | Lower accuracy ceiling |
| EasyOCR | ~500MB–1GB | Easy integration, `pt` support | Simpler architecture |

**Recommended**: **Surya** — document-first design, fits comfortably in 4GB VRAM, superior handling of degraded Brazilian receipts.

---

## 3. Implementation Architecture

### Pipeline flow

```
PDF download
    ↓
Try pdf-parse (fast path, ~16–25% success)
    ↓
If no text or low quality:
    Ghostscript render → PNG pages
    Surya OCR (GPU)
    ↓
Text output → downstream flags (CATEGORY_MISMATCH, etc.)
```

### Node.js → Python bridge

Since the ETL is TypeScript and DL OCR tools are Python-native, use `child_process`:

```ts
const { execFile } = require('child_process').promises;

async function extractText(pdfPath: string): Promise<string> {
  // Fast path: try pdf-parse
  const directText = await tryPdfParse(pdfPath);
  if (directText && directText.length >= 100) {
    return directText;
  }

  // Deep learning OCR path
  const { stdout } = await execFile('python3', [
    'ocr_worker.py',
    '--pdf', pdfPath,
    '--lang', 'por,eng'  // Portuguese primary
  ]);
  return stdout;
}
```

### Python worker skeleton (`ocr_worker.py`)

```python
import argparse
from surya.ocr import run_ocr
from surya.model.seg.loader import load_segmenter
from surya.model.recognition.loader import load_recognizer

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--pdf', required=True)
    parser.add_argument('--lang', default='por')
    args = parser.parse_args()

    # Load once per process (amortize over batch)
    seg_model = load_segmenter()
    rec_model = load_recognizer()

    # Ghostscript render to images happens here or in pipeline
    images = pdf_to_images(args.pdf)  # Use pdf2image

    results = run_ocr(images, [args.lang.split(',')], seg_model, rec_model)

    # Concatenate all page text
    full_text = '\n'.join(r.text for page in results for r in page)
    print(full_text)

if __name__ == '__main__':
    main()
```

---

## 4. Quality Thresholds

### Minimum text length

Per the heuristics validation: OCR-sourced text is lower quality. Apply a minimum threshold before keyword matching:

```ts
const MIN_OCR_TEXT_LENGTH = 100;  // characters
if (ocrText.length < MIN_OCR_TEXT_LENGTH) {
  // Skip CATEGORY_MISMATCH, log low-confidence
  flags.skip('CATEGORY_MISMATCH', 'insufficient_ocr_text');
}
```

### Confidence scoring

Surya returns per-line confidence. Consider flagging documents with mean confidence < 0.7 for manual review or secondary OCR pass.

---

## 5. Batch Processing Considerations

| Factor | Implication |
|--------|-------------|
| GPU amortization | Model load cost (~3s) pays off after ~20–30 pages on RTX 3050 |
| 16GB system RAM | Sufficient for Ghostscript buffer + Surya batch processing |
| 4GB VRAM | Limit batch size to 4–8 pages at a time to avoid OOM |
| Database integration | Store `ocr_text`, `ocr_engine`, `ocr_confidence` in `expenses` table for audit trail |

---

## 6. Alternative: OCRmyPDF (Tesseract-based)

If deep learning proves too heavy or integration friction is high, **OCRmyPDF** is the best classic OCR alternative:

```bash
ocrmypdf --sidecar output.txt --language por --optimize 1 input.pdf output.pdf
```

Benefits:
- Single CLI tool (no orchestration)
- Handles Ghostscript + preprocessing + Tesseract internally
- Document-aware rotation, deskew, unpaper
- Portuguese language pack available

Tradeoff: Lower accuracy on degraded scans compared to Surya.

---

## 7. Decision Summary

| Question | Answer |
|----------|--------|
| OCR engine | **Surya** (deep learning) over Tesseract |
| GPU required? | Recommended but not mandatory — Surya can CPU-fallback |
| Integration | Python worker called from Node.js ETL |
| Text coverage | ~81% of Recibos, ~75% of NFs will hit OCR path |
| Quality gate | ≥100 chars minimum before keyword matching |
| Backup plan | OCRmyPDF if DL integration blocks |
