// Client for the PaddleOCR service in /ocr-service. Optional: set OCR_SERVICE_URL.
// On Cloud Run the call carries an ID token for the OCR service (service-to-service auth).
export interface OcrLine {
  text: string;
  confidence: number;
  box: [number, number, number, number];
}
export interface OcrResult {
  engine: string;
  pages: { page: number; lines: OcrLine[] }[];
}

async function idToken(audience: string, fetchImpl: typeof fetch) {
  if (process.env.OCR_SERVICE_AUTH === "none") return null;
  try {
    const r = await fetchImpl(`http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=${encodeURIComponent(audience)}`, {
      headers: { "Metadata-Flavor": "Google" },
      signal: AbortSignal.timeout(2000),
    });
    return r.ok ? await r.text() : null;
  } catch {
    return null; // not on Google Cloud
  }
}

export function ocrConfigured() {
  return !!process.env.OCR_SERVICE_URL;
}

export async function runOcr(file: Buffer, mimeType: string, filename: string, lang = "en", fetchImpl: typeof fetch = fetch): Promise<OcrResult> {
  const base = process.env.OCR_SERVICE_URL!.replace(/\/$/, "");
  const form = new FormData();
  form.set("file", new Blob([new Uint8Array(file)], { type: mimeType }), filename);
  form.set("lang", lang);
  const token = await idToken(base, fetchImpl);
  const res = await fetchImpl(`${base}/ocr`, {
    method: "POST",
    body: form,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal: AbortSignal.timeout(Number(process.env.OCR_TIMEOUT_MS) || 60000),
  });
  if (!res.ok) throw new Error(`OCR service answered HTTP ${res.status}`);
  return (await res.json()) as OcrResult;
}

export interface InkMarkResult {
  pages: { page: number; marks: [number, number, number, number][]; regions: { similarity: number; source: number[]; copy: number[] }[] }[];
}

/** Coloured ink marks (stamps, seals, signatures) and any pair that is a digital copy of another. */
export async function runInkMarkCheck(file: Buffer, mimeType: string, filename: string, fetchImpl: typeof fetch = fetch): Promise<InkMarkResult> {
  const base = process.env.OCR_SERVICE_URL!.replace(/\/$/, "");
  const form = new FormData();
  form.set("file", new Blob([new Uint8Array(file)], { type: mimeType }), filename);
  const token = await idToken(base, fetchImpl);
  const res = await fetchImpl(`${base}/copy-move`, { method: "POST", body: form, headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(Number(process.env.OCR_TIMEOUT_MS) || 60000) });
  if (!res.ok) throw new Error(`Ink-mark check answered HTTP ${res.status}`);
  return (await res.json()) as InkMarkResult;
}
