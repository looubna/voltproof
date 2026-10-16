import { emptyRaw, normalizeExtraction } from "@/lib/extraction/schema";
import type { CaseDocument, FieldName, Provenance } from "@/lib/types";

type Values = Partial<Record<FieldName, unknown>>;

export function makeDoc(
  id: string,
  values: Values,
  opts: { provenance?: Provenance; confidence?: Partial<Record<FieldName, number>>; noQuote?: FieldName[]; status?: CaseDocument["extractionStatus"] } = {},
): CaseDocument {
  const raw = emptyRaw() as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(values)) {
    const name = k as FieldName;
    raw[name] = {
      value: v,
      page: 1,
      quote: opts.noQuote?.includes(name) ? null : `quote for ${name}`,
      confidence: opts.confidence?.[name] ?? 0.95,
    };
  }
  const { fields } = normalizeExtraction(raw as never, 0.7);
  const status = opts.status ?? "extracted";
  return {
    id,
    filename: `${id}.pdf`,
    mimeType: "application/pdf",
    sizeBytes: 100,
    storageKey: `k/${id}`,
    uploadedAt: "2026-10-01T00:00:00Z",
    uploadedBy: "tester",
    provenance: opts.provenance ?? "seller_provided",
    sampleId: null,
    integrity: { sha256: id, detectedType: "pdf", checkedAt: "2026-10-01T00:00:00Z", indicators: [] },
    extractionStatus: status,
    extractionError: null,
    extraction: status === "extracted" ? { mode: "demo-fixture", model: null, extractedAt: "2026-10-01T00:00:00Z", fields, warnings: [] } : null,
    extractionHistory: [],
  };
}

export const VIN_A = "5YJ3E1EA0MF934821";
export const VIN_B = "5YJ3E1EA1MF937730";
export const vehicle = { make: "Tesla", model: "Model 3", year: 2021, vin: VIN_A };
export const REF = "2026-10-03T09:00:00.000Z";
