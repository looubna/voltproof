"""Cloned stamp / seal / signature detection.

A real rubber stamp or pen signature never prints the same way twice: ink,
pressure and angle vary. Two marks on a page that are pixel-for-pixel the
same were pasted digitally. This finds coloured ink marks (stamps, seals,
signatures in blue or red ink), then compares every pair.

Why not keypoint copy-move (ORB + RANSAC, as in DocAuth by Abhilasha Jha,
github.com/trinity652/DocAuth, MIT)? We measured it on our sample documents:
it flagged every genuine document, because printed text repeats the same
glyphs and lines everywhere. It is built for photographs, not paperwork.
The idea of looking for internal duplication comes from that project.
"""
from __future__ import annotations

import cv2
import numpy as np

MIN_AREA_FRACTION = 0.0015  # a mark must cover at least this share of the page
SIZE_TOLERANCE = 0.06  # two marks must be within 6% in width and height
MATCH_THRESHOLD = 0.93  # normalised correlation for "the same mark"


def ink_marks(bgr: np.ndarray) -> list[tuple[int, int, int, int]]:
    """Bounding boxes (x, y, w, h) of coloured ink marks."""
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    sat, val = hsv[:, :, 1], hsv[:, :, 2]
    mask = ((sat > 90) & (val > 40) & (val < 245)).astype(np.uint8) * 255
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    # Outer outlines only, so a stamp's inner ring and lettering count as one mark.
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    h, w = mask.shape
    boxes = []
    for c in contours:
        x, y, bw, bh = cv2.boundingRect(c)
        if bw * bh >= MIN_AREA_FRACTION * h * w and bw > 20 and bh > 20:
            boxes.append((int(x), int(y), int(bw), int(bh)))
    return boxes


def detect_copy_move(bgr: np.ndarray) -> dict:
    h, w = bgr.shape[:2]
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    marks = ink_marks(bgr)
    to_box = lambda x, y, bw, bh: [round(y / h * 1000), round(x / w * 1000), round((y + bh) / h * 1000), round((x + bw) / w * 1000)]
    regions = []
    for i in range(len(marks)):
        for j in range(i + 1, len(marks)):
            (x1, y1, w1, h1), (x2, y2, w2, h2) = marks[i], marks[j]
            if abs(w1 - w2) > SIZE_TOLERANCE * max(w1, w2) or abs(h1 - h2) > SIZE_TOLERANCE * max(h1, h2):
                continue
            a = gray[y1 : y1 + h1, x1 : x1 + w1]
            b = cv2.resize(gray[y2 : y2 + h2, x2 : x2 + w2], (w1, h1))
            score = float(cv2.matchTemplate(a, b, cv2.TM_CCOEFF_NORMED)[0][0])
            if score >= MATCH_THRESHOLD:
                regions.append({"similarity": round(score, 4), "source": to_box(*marks[i]), "copy": to_box(*marks[j])})
    regions.sort(key=lambda r: -r["similarity"])
    return {"regions": regions[:5], "marks": [to_box(*m) for m in marks]}
