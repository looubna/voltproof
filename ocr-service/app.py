"""VoltProof OCR service: PaddleOCR as a second, independent reader.

Gemini reads every document. For photos and scanned PDFs (no text layer to
check against), this service reads the same file with PaddleOCR so that key
identifiers (VIN, odometer, dates) are confirmed by two different engines.
PaddleOCR's recognition models also handle handwriting, which matters for
handwritten service books and odometer notes.

POST /ocr  (multipart: file=<image or PDF>, lang=<en|korean|japan|...>)
  -> {"engine": "...", "pages": [{"page": 1, "lines": [{"text", "confidence", "box"}]}]}

Deploy as its own Cloud Run service (CPU is enough); the main app calls it
with an ID token. Nothing is stored.
"""
from __future__ import annotations

import io
import os
from functools import lru_cache

import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from PIL import Image

MAX_BYTES = 15 * 1024 * 1024
MAX_PDF_PAGES = 5

app = FastAPI(title="VoltProof OCR", version="1.0.0")


@lru_cache(maxsize=4)
def engine(lang: str):
    from paddleocr import PaddleOCR

    # Orientation and unwarping help phone photos of paper documents.
    # oneDNN is off: PaddlePaddle 3.x's oneDNN path fails on x86 Cloud Run CPUs for these models.
    return PaddleOCR(lang=lang, use_doc_orientation_classify=True, use_doc_unwarping=False, use_textline_orientation=True, enable_mkldnn=False)


def to_images(data: bytes, content_type: str) -> list[Image.Image]:
    if data[:5] == b"%PDF-":
        import pypdfium2 as pdfium

        pdf = pdfium.PdfDocument(data)
        return [pdf[i].render(scale=2.0).to_pil().convert("RGB") for i in range(min(len(pdf), MAX_PDF_PAGES))]
    try:
        return [Image.open(io.BytesIO(data)).convert("RGB")]
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=415, detail=f"Unsupported file: {e}") from e


def read_page(ocr, img: Image.Image) -> list[dict]:
    lines = []
    w, h = img.size
    for res in ocr.predict(np.array(img)):
        texts = res["rec_texts"]
        scores = res["rec_scores"]
        polys = res["rec_polys"]
        for text, score, poly in zip(texts, scores, polys):
            xs = [float(p[0]) for p in poly]
            ys = [float(p[1]) for p in poly]
            # Same box convention as the extraction: [ymin, xmin, ymax, xmax] scaled 0-1000.
            box = [round(min(ys) / h * 1000), round(min(xs) / w * 1000), round(max(ys) / h * 1000), round(max(xs) / w * 1000)]
            lines.append({"text": str(text), "confidence": round(float(score), 4), "box": box})
    return lines


@app.post("/copy-move")
async def copy_move(file: UploadFile = File(...)):
    """Coloured ink marks (stamps, seals, signatures) and any pair that is a digital copy."""
    import cv2

    from copy_move import detect_copy_move

    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="File too large.")
    pages = []
    for i, img in enumerate(to_images(data, file.content_type or "")):
        bgr = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
        pages.append({"page": i + 1, **detect_copy_move(bgr)})
    return {"engine": "ink-mark duplicate check", "pages": pages}


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/ocr")
async def ocr(file: UploadFile = File(...), lang: str = Form("en")):
    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="File too large.")
    if lang not in {"en", "korean", "japan", "ch", "latin", "id"}:
        raise HTTPException(status_code=400, detail="Unsupported language.")
    reader = engine("en" if lang == "id" else lang)
    pages = [{"page": i + 1, "lines": read_page(reader, img)} for i, img in enumerate(to_images(data, file.content_type or ""))]
    return {"engine": "paddleocr", "pages": pages}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8081")))
