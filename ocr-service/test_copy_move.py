"""Run: .venv/bin/python test_copy_move.py  (from ocr-service/)"""
import glob
import io

import cv2
import numpy as np
import pypdfium2 as pdfium
from PIL import Image, ImageDraw

from copy_move import detect_copy_move


def bgr(img):
    return cv2.cvtColor(np.array(img.convert("RGB")), cv2.COLOR_RGB2BGR)


def page(path):
    return pdfium.PdfDocument(path)[0].render(scale=2.0).to_pil().convert("RGB") if path.endswith(".pdf") else Image.open(path).convert("RGB")


def stamp(img, cx, cy, ring=6):
    d = ImageDraw.Draw(img)
    d.ellipse([cx - 110, cy - 110, cx + 110, cy + 110], outline=(170, 20, 30), width=ring)
    d.ellipse([cx - 85, cy - 85, cx + 85, cy + 85], outline=(170, 20, 30), width=3)
    d.text((cx - 40, cy - 5), "PAID", fill=(170, 20, 30))


# 1. No clean sample document is flagged.
for f in sorted(glob.glob("../samples/*")):
    assert detect_copy_move(bgr(page(f)))["regions"] == [], f

# 2. Two separately drawn stamps are not flagged; a pasted copy is, even after JPEG re-save.
base = page("../samples/id3-insurance-claim-record.pdf")
two = base.copy()
stamp(two, 900, 1350)
stamp(two, 300, 1150, ring=5)
assert detect_copy_move(bgr(two))["regions"] == []

cloned = base.copy()
stamp(cloned, 900, 1350)
cloned.paste(cloned.crop((785, 1235, 1015, 1465)), (150, 1050))
buf = io.BytesIO()
cloned.save(buf, format="JPEG", quality=85)
found = detect_copy_move(bgr(Image.open(io.BytesIO(buf.getvalue()))))["regions"]
assert len(found) == 1 and found[0]["similarity"] > 0.95, found
print("copy-move tests passed")
