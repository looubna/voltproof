// Runs the forensic checks that apply to a file, after extraction, and marks
// any value with a possible edit as unsupported so no rule relies on it.
import type { DocumentForensics, ExtractionFields, ForensicMethod } from "../types";
import { findInjections, quoteFromInjection } from "./injection";
import { analyzeJpegGhost } from "./jpeg-ghost";
import { analyzePdfLayer, readPdfLayer } from "./pdf-text";
import { checkPdfSignatures } from "./signature";

/** Images produced by the checks, for the reviewer. Stored next to the file by the caller. */
export interface ForensicArtifacts {
  heatmap?: Buffer;
}

export async function analyzeDocument(
  file: Buffer,
  mimeType: string,
  fields: ExtractionFields | null,
  artifacts: ForensicArtifacts = {},
  /** Text from the second OCR read, for images and scans (no text layer). */
  ocrText?: string,
): Promise<DocumentForensics> {
  const methods: ForensicMethod[] = [];
  const result: DocumentForensics = { checkedAt: new Date().toISOString(), methods, indicators: [], signatures: [] };
  let documentText = ocrText ?? "";
  try {
    if (mimeType === "application/pdf") {
      result.signatures = await checkPdfSignatures(file);
      if (result.signatures.length) methods.push("pdf_signature");
      for (const s of result.signatures) {
        if (s.integrity === "invalid") result.indicators.push({ code: "signature_broken", severity: "potential", method: "pdf_signature", message: `A digital signature${s.signer ? ` by ${s.signer}` : ""} no longer matches the document: its content changed after signing.` });
        else if (s.integrity === "valid" && !s.coversWholeFile) result.indicators.push({ code: "changed_after_signing", severity: "potential", method: "pdf_signature", message: `Content was added after ${s.signer ?? "the signer"} signed the document. The added part is not covered by the signature.` });
      }
      const layer = await readPdfLayer(file);
      if (layer) {
        documentText = layer.pages.map((items) => items.map((i) => i.str).join("\n")).join("\n");
        if (fields) {
          methods.push("pdf_text_layer");
          if (layer.annotations.length) methods.push("pdf_annotation");
          result.indicators.push(...analyzePdfLayer(layer, fields));
        }
      }
    } else if (mimeType === "image/jpeg" && fields) {
      const g = await analyzeJpegGhost(file, fields);
      if (g.primaryQuality !== null) methods.push("jpeg_ghost");
      if (g.indicators.length && g.heatmap) artifacts.heatmap = g.heatmap;
      result.indicators.push(...g.indicators);
    }
    // Text addressed to AI systems: never part of a genuine document.
    const injections = findInjections(documentText);
    if (documentText) methods.push("injection_scan");
    for (const line of injections) {
      result.indicators.push({
        code: "instructions_to_ai",
        severity: "potential",
        method: "injection_scan",
        message: `The document contains text addressed to automated readers: “${line}”. A genuine document does not instruct AI systems; nothing on this line is used.`,
      });
    }
    if (fields && injections.length) {
      for (const [name, f] of Object.entries(fields)) {
        if (f && f.value !== null && quoteFromInjection(f.quote, injections)) {
          result.indicators.push({ code: "instructions_to_ai", severity: "potential", method: "injection_scan", field: name as keyof ExtractionFields, message: `This value was read from text addressed to AI systems (“${f.quote}”), so it is not used.` });
        }
      }
    }
  } catch (e) {
    result.indicators.push({ code: "forensics_error", severity: "info", method: "pdf_text_layer", message: `Forensic checks could not finish (${e instanceof Error ? e.message : String(e)}).` });
  }
  if (fields) {
    for (const i of result.indicators) {
      const f = i.field ? fields[i.field] : undefined;
      if (!f || i.severity !== "potential") continue;
      f.tamperIndicator = i.message;
      if (f.supported) {
        f.supported = false;
        f.unsupportedReason = "possible edit found by a forensic check";
      }
    }
  }
  return result;
}
