import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseModelOutput } from "@/lib/extraction/schema";
import { checkIntegrity, detectType } from "@/lib/integrity";
import { SAMPLE_DOCS, sampleText } from "@/lib/samples/definitions";

describe("synthetic samples", () => {
  it("every fixture quote appears verbatim on the cited page", () => {
    for (const doc of SAMPLE_DOCS) {
      const pages = sampleText(doc);
      for (const [field, c] of Object.entries(doc.cite)) {
        expect({ doc: doc.id, field, found: pages[c!.page - 1]?.includes(c!.quote) ?? false }).toEqual({ doc: doc.id, field, found: true });
      }
      for (const field of Object.keys(doc.truth)) expect(doc.cite).toHaveProperty(field);
    }
  });
  it("sample files exist and pass basic integrity checks", async () => {
    for (const doc of SAMPLE_DOCS) {
      const buf = await readFile(path.join(process.cwd(), "samples", doc.filename));
      const r = checkIntegrity(buf, doc.filename);
      expect(r.detectedType).toBe(doc.format === "pdf" ? "pdf" : doc.format === "jpg" ? "jpeg" : "png");
      // Doctored samples are meant to carry signs of editing.
      if (!doc.edits) expect({ doc: doc.id, indicators: r.indicators.filter((i) => i.severity === "potential") }).toEqual({ doc: doc.id, indicators: [] });
    }
  });
});

describe("integrity indicators", () => {
  it("detects types by content, not extension", () => {
    expect(detectType(Buffer.from("%PDF-1.7"))).toBe("pdf");
    expect(detectType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpeg");
    expect(detectType(Buffer.from("GIF89a"))).toBeNull();
  });
  it("flags extension mismatch, incremental updates, editing software and modified dates as potential only", () => {
    const pdf = Buffer.from("%PDF-1.4\n<< /Producer (Adobe Photoshop 25) /CreationDate (D:20260101) /ModDate (D:20260301) >>\n%%EOF\nmore\n%%EOF\n");
    const r = checkIntegrity(pdf, "invoice.png");
    const codes = r.indicators.map((i) => i.code).sort();
    expect(codes).toEqual(["extension_mismatch", "pdf_editing_software", "pdf_incremental_update", "pdf_modified_after_creation"]);
    expect(r.indicators.every((i) => i.severity === "potential")).toBe(true);
    for (const i of r.indicators) expect(i.message).not.toMatch(/forged|fraud/i);
  });
  it("produces a stable SHA-256", () => {
    expect(checkIntegrity(Buffer.from("%PDF-x"), "a.pdf").sha256).toBe(checkIntegrity(Buffer.from("%PDF-x"), "b.pdf").sha256);
  });
});

describe("model output validation", () => {
  const blank = { value: null, page: null, quote: null, confidence: null };
  const base = {
    documentType: { value: "service_invoice", page: 1, quote: "SERVICE INVOICE", confidence: 0.99 },
    issuer: blank, documentDate: blank, vin: blank, make: blank, model: blank, odometer: blank,
    serviceDetails: blank, batteryTestDate: blank, batterySohPercent: blank, batteryTestProvider: blank,
  };
  it("accepts schema-valid output and keeps nulls as nulls", () => {
    const { fields } = parseModelOutput(JSON.stringify(base), 0.7);
    expect(fields.documentType).toMatchObject({ value: "service_invoice", supported: true });
    expect(fields.vin).toMatchObject({ value: null, supported: false });
  });
  it("rejects invalid JSON and schema violations", () => {
    expect(() => parseModelOutput("not json", 0.7)).toThrow(/valid JSON/);
    expect(() => parseModelOutput(JSON.stringify({ ...base, documentType: { value: "passport" } }), 0.7)).toThrow(/schema/);
    expect(() => parseModelOutput(JSON.stringify({ documentType: base.documentType }), 0.7)).toThrow(/schema/);
  });
  it("marks unquoted, low-confidence and out-of-range values unsupported", () => {
    const { fields } = parseModelOutput(JSON.stringify({
      ...base,
      vin: { value: " 5yj3e1ea1mf934821 ", page: 1, quote: null, confidence: 0.99 },
      make: { value: "Tesla", page: 1, quote: "Tesla", confidence: 0.3 },
      batterySohPercent: { value: 140, page: 2, quote: "SOH 140", confidence: 0.9 },
    }), 0.7);
    expect(fields.vin).toMatchObject({ value: "5YJ3E1EA1MF934821", supported: false, unsupportedReason: "no supporting quote from the document" });
    expect(fields.make.supported).toBe(false);
    expect(fields.make.unsupportedReason).toMatch(/below/);
    expect(fields.batterySohPercent.supported).toBe(false);
  });
});
