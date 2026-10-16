// Grounding: checks that each quote the model cites really appears in the
// document's own text layer. A quote that cannot be found makes the field
// unsupported, so the rules ignore it ("the document says so", not "the model
// says so"). Images and scanned PDFs without a text layer cannot be checked
// this way and are labelled as such.
import { extractText, getDocumentProxy } from "unpdf";
import type { ExtractionFields, FieldName, GroundingResult } from "../types";

export function normText(s: string) {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string) {
  const prev = new Array(b.length + 1).fill(0).map((_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/** True when some window of `hay` is at least `minSimilarity` similar to `needle`. */
export function fuzzyContains(hay: string, needle: string, minSimilarity = 0.9) {
  if (!needle) return false;
  if (hay.includes(needle)) return true;
  const n = needle.length;
  if (n < 8 || hay.length < n * 0.8) return false;
  const maxDist = Math.floor(n * (1 - minSimilarity));
  // Every start position; pages are short, and quotes are capped at a few hundred characters.
  for (let i = 0; i + n - maxDist <= hay.length; i++) {
    // Cheap pre-check: a close match must share one of its first characters.
    if (hay[i] !== needle[0] && hay[i + 1] !== needle[1] && hay[i + 2] !== needle[2]) continue;
    for (const len of [n, n - maxDist, n + maxDist]) {
      if (len <= 0 || i + len > hay.length) continue;
      if (levenshtein(hay.slice(i, i + len), needle) <= maxDist) return true;
    }
  }
  return false;
}

export function groundQuote(pages: string[], quote: string, page: number | null): { result: GroundingResult; page: number | null } {
  const q = normText(quote);
  const normPages = pages.map(normText);
  const onPage = page && normPages[page - 1] !== undefined ? normPages[page - 1] : null;
  if (onPage !== null && onPage.includes(q)) return { result: "exact", page };
  const elsewhere = normPages.findIndex((p) => p.includes(q));
  if (elsewhere >= 0) return { result: "other_page", page: elsewhere + 1 };
  if (onPage !== null && fuzzyContains(onPage, q)) return { result: "fuzzy", page };
  const fuzzyElsewhere = normPages.findIndex((p) => fuzzyContains(p, q));
  if (fuzzyElsewhere >= 0) return { result: "fuzzy", page: fuzzyElsewhere + 1 };
  return { result: "not_found", page };
}

/** Applies grounding to every supported field in place. Returns the number of quotes not found. */
export function applyGrounding(fields: ExtractionFields, pages: string[]) {
  let notFound = 0;
  for (const name of Object.keys(fields) as FieldName[]) {
    const f = fields[name];
    if (!f || f.value === null || !f.quote) continue;
    const g = groundQuote(pages, f.quote, f.page);
    f.grounded = g.result;
    if (g.result === "other_page") f.page = g.page;
    if (g.result === "not_found" && f.supported) {
      f.supported = false;
      f.unsupportedReason = "the quoted text was not found in the document";
      notFound++;
    }
  }
  return notFound;
}

export function markNotCheckable(fields: ExtractionFields) {
  for (const name of Object.keys(fields) as FieldName[]) {
    const f = fields[name];
    if (f && f.value !== null && f.quote) f.grounded = "not_checked";
  }
}

/** Per-page text of a PDF, or null if it has no usable text layer (scans) or cannot be parsed. */
export async function pdfPageTexts(file: Buffer): Promise<string[] | null> {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(file));
    const { text } = await extractText(pdf, { mergePages: false });
    const pages = Array.isArray(text) ? text : [text];
    return pages.join("").trim().length >= 20 ? pages : null;
  } catch {
    return null;
  }
}

/** Grounds an extraction against the file. */
export async function groundExtraction(fields: ExtractionFields, file: Buffer, mimeType: string) {
  const pages = mimeType === "application/pdf" ? await pdfPageTexts(file) : null;
  if (!pages) {
    markNotCheckable(fields);
    return { grounding: "not_checkable" as const, notFound: 0 };
  }
  return { grounding: "pdf_text" as const, notFound: applyGrounding(fields, pages) };
}
