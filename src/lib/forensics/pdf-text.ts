// Field-level checks on a PDF's text layer and annotations.
//
// Common ways a PDF value is edited leave traces here:
// - "cover and retype": a white box hides the old value and new text is drawn
//   on top. The old text usually stays in the text layer, at the same spot.
// - "type over in an editor": the new value is set in a font that nothing else
//   on the page uses (the editor substitutes a font it has).
// - "annotate": a FreeText, stamp or shape annotation is laid over the page.
// Each is a *potential* indicator: legitimate documents can trigger them.
import { getDocumentProxy } from "unpdf";
import { normText } from "../extraction/grounding";
import { FIELD_LABEL } from "../labels";
import type { ExtractionFields, FieldName, ForensicIndicator } from "../types";

export interface TextItem {
  str: string;
  font: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PdfLayer {
  pages: TextItem[][];
  annotations: { page: number; subtype: string; rect: [number, number, number, number]; contents: string }[];
}

const SUSPICIOUS_ANNOTATIONS = new Set(["FreeText", "Stamp", "Square", "Circle", "Ink", "Redact", "Polygon"]);

export async function readPdfLayer(file: Buffer): Promise<PdfLayer | null> {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(file));
    const pages: TextItem[][] = [];
    const annotations: PdfLayer["annotations"] = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      pages.push(
        (tc.items as { str?: string; fontName?: string; transform?: number[]; width?: number; height?: number }[])
          .filter((i) => i.str && i.str.trim() && i.transform)
          .map((i) => ({ str: i.str!, font: i.fontName ?? "", x: i.transform![4], y: i.transform![5], w: i.width ?? 0, h: i.height || Math.abs(i.transform![3]) })),
      );
      for (const a of (await page.getAnnotations()) as { subtype?: string; rect?: number[]; contentsObj?: { str?: string } }[]) {
        if (a.subtype && a.rect) annotations.push({ page: p, subtype: a.subtype, rect: a.rect as [number, number, number, number], contents: a.contentsObj?.str ?? "" });
      }
    }
    return { pages, annotations };
  } catch {
    return null;
  }
}

function overlapRatio(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const smaller = Math.min(a.w * a.h, b.w * b.h);
  return smaller > 0 ? (ix * iy) / smaller : 0;
}

/** Text items on a page that make up a field's quote. */
function itemsForQuote(items: TextItem[], quote: string) {
  const q = normText(quote);
  return items.filter((i) => {
    const s = normText(i.str);
    return s.length >= 2 && (q.includes(s) || s.includes(q));
  });
}

export function analyzePdfLayer(layer: PdfLayer, fields: ExtractionFields): ForensicIndicator[] {
  const out: ForensicIndicator[] = [];
  const flaggedPairs = new Set<string>();

  for (const name of Object.keys(fields) as FieldName[]) {
    const f = fields[name];
    if (!f || f.value === null || !f.quote || name === "documentType") continue;
    const pageNo = f.page ?? 1;
    const items = layer.pages[pageNo - 1];
    if (!items) continue;
    const mine = itemsForQuote(items, f.quote);
    if (!mine.length) continue;
    const label = FIELD_LABEL[name] ?? name;

    // 1. Other text drawn at the same place: something was written over something else.
    for (const m of mine) {
      for (const o of items) {
        if (mine.includes(o) || normText(o.str) === normText(m.str)) continue;
        if (overlapRatio(m, o) < 0.5) continue;
        const key = [m.str, o.str].sort().join("|");
        if (flaggedPairs.has(key)) continue;
        flaggedPairs.add(key);
        out.push({
          code: "text_overlaps_text",
          severity: "potential",
          method: "pdf_text_layer",
          field: name,
          page: pageNo,
          message: `${label}: the visible text “${m.str.trim()}” sits on top of other text in the same place (“${o.str.trim()}”). This is how a value is covered and retyped.`,
        });
      }
    }

    // 2. The value is set in a font that nothing else on the page uses.
    // Look at the items carrying the value itself, not its label.
    const valueText = normText(typeof f.value === "object" && f.value && "reading" in f.value ? String((f.value as { reading: number }).reading) : String(f.value));
    const valueItems = mine.filter((m) => {
      const t = normText(m.str).replace(/[,\s]/g, "");
      const v = valueText.replace(/[,\s]/g, "");
      return t.length >= 2 && (t.includes(v) || v.includes(t));
    });
    const subject = valueItems.length ? valueItems : mine;
    const fonts = new Set(subject.map((m) => m.font));
    if (fonts.size === 1) {
      const font = [...fonts][0];
      const others = items.filter((i) => !subject.includes(i));
      const usedElsewhere = others.some((i) => i.font === font);
      const otherFonts = new Set(others.map((i) => i.font));
      if (!usedElsewhere && others.length >= 3 && otherFonts.size >= 1) {
        out.push({
          code: "unique_font",
          severity: "potential",
          method: "pdf_text_layer",
          field: name,
          page: pageNo,
          message: `${label}: “${subject.map((m) => m.str.trim()).join(" ")}” is the only text on page ${pageNo} set in its font. Editors substitute a font when text is typed over a PDF.`,
        });
      }
    }

    // 3. An annotation laid over the value.
    for (const a of layer.annotations.filter((x) => x.page === pageNo && SUSPICIOUS_ANNOTATIONS.has(x.subtype))) {
      const rect = { x: a.rect[0], y: a.rect[1], w: a.rect[2] - a.rect[0], h: a.rect[3] - a.rect[1] };
      if (mine.some((m) => overlapRatio(m, rect) > 0.3)) {
        out.push({
          code: "annotation_over_value",
          severity: "potential",
          method: "pdf_annotation",
          field: name,
          page: pageNo,
          message: `${label}: a ${a.subtype} annotation is laid over this value${a.contents ? ` (“${a.contents.slice(0, 60)}”)` : ""}. Annotations sit on top of the page and can hide or replace what is printed.`,
        });
      }
    }
  }

  // Annotations anywhere on the page, even if not over a field we read.
  const overField = new Set(out.filter((i) => i.method === "pdf_annotation").map((i) => i.page));
  for (const a of layer.annotations.filter((x) => SUSPICIOUS_ANNOTATIONS.has(x.subtype) && !overField.has(x.page))) {
    out.push({ code: "annotation_present", severity: "info", method: "pdf_annotation", page: a.page, message: `Page ${a.page} has a ${a.subtype} annotation on top of the printed content.` });
  }
  return out;
}
