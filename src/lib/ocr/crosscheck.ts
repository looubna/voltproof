// Second, independent read of key identifiers. Gemini reads the document; the
// PaddleOCR service reads it again. When the two disagree on a VIN or an
// odometer reading, the value goes to a person instead of into the checks.
import { normalizeVin } from "../normalize";
import type { ExtractionFields, FieldName, Odometer, SecondRead } from "../types";
import type { OcrResult } from "./paddle";

function distance(a: string, b: string) {
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const t = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = t;
    }
  }
  return d[b.length];
}

function ocrLines(ocr: OcrResult) {
  return ocr.pages.flatMap((p) => p.lines.map((l) => ({ ...l, page: p.page })));
}

function checkVin(value: string, ocr: OcrResult): SecondRead {
  const want = normalizeVin(value);
  // VIN-length runs of words: OCR often splits a VIN into two or three pieces.
  const candidates = ocrLines(ocr).flatMap((l) => {
    const words = l.text.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
    const out: { v: string; l: typeof l }[] = [];
    for (let i = 0; i < words.length; i++) {
      let v = "";
      for (let j = i; j < words.length && v.length < 17; j++) {
        v += words[j];
        if (v.length === 17) out.push({ v, l });
      }
    }
    return out;
  });
  if (candidates.some((c) => c.v === want)) return { engine: "paddleocr", result: "agree" };
  const near = candidates.map((c) => ({ ...c, d: distance(c.v, want) })).filter((c) => c.d <= 3).sort((a, b) => a.d - b.d)[0];
  if (near) return { engine: "paddleocr", result: "disagree", text: near.v };
  return { engine: "paddleocr", result: "not_found" };
}

function checkOdometer(value: Odometer, ocr: OcrResult): SecondRead {
  const want = String(Math.round(value.reading));
  const lines = ocrLines(ocr).map((l) => l.text);
  const numbers = lines.flatMap((t) => (t.match(/\d[\d,. ]{2,9}\d/g) ?? []).map((n) => n.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "")));
  if (numbers.includes(want)) return { engine: "paddleocr", result: "agree" };
  // A different number of similar length next to a distance unit is a real disagreement.
  const unitLine = lines.find((t) => /\b(km|mi|miles|odo)\b/i.test(t) && /\d{4,7}/.test(t.replace(/[,. ]/g, "")));
  const other = unitLine?.replace(/[,. ]/g, "").match(/\d{4,7}/)?.[0]?.replace(/^0+(?=\d)/, "");
  if (other && other !== want && Math.abs(other.length - want.length) <= 1) return { engine: "paddleocr", result: "disagree", text: unitLine!.trim() };
  return { engine: "paddleocr", result: "not_found" };
}

function checkPlain(value: string, ocr: OcrResult): SecondRead {
  const want = value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const hay = ocrLines(ocr).map((l) => l.text.toLowerCase().replace(/[^a-z0-9]/g, "")).join("");
  return { engine: "paddleocr", result: want && hay.includes(want) ? "agree" : "not_found" };
}

/** Compares identifiers with the OCR read, in place. Returns the fields where the readers disagree. */
export function crossCheck(fields: ExtractionFields, ocr: OcrResult): FieldName[] {
  const disagreements: FieldName[] = [];
  const apply = (name: FieldName, r: SecondRead) => {
    const f = fields[name];
    f.secondRead = r;
    if (r.result === "disagree") {
      disagreements.push(name);
      if (f.supported) {
        f.supported = false;
        f.unsupportedReason = `a second, independent reader (PaddleOCR) read “${r.text}”`;
      }
    }
  };
  if (fields.vin?.value) apply("vin", checkVin(String(fields.vin.value), ocr));
  if (fields.odometer?.value) apply("odometer", checkOdometer(fields.odometer.value as Odometer, ocr));
  if (fields.batterySohPercent?.value !== null && fields.batterySohPercent?.value !== undefined) apply("batterySohPercent", checkPlain(`${fields.batterySohPercent.value}`, ocr));
  if (fields.documentDate?.value) apply("documentDate", checkPlain(String(fields.documentDate.value), ocr));
  return disagreements;
}
