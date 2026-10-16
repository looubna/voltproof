// Runs the forensic checks that apply to a file, after extraction, and marks
// any value with a possible edit as unsupported so no rule relies on it.
import type { DocumentForensics, ExtractionFields, ForensicMethod } from "../types";
import { analyzeJpegGhost } from "./jpeg-ghost";
import { analyzePdfLayer, readPdfLayer } from "./pdf-text";
import { checkPdfSignatures } from "./signature";

export async function analyzeDocument(file: Buffer, mimeType: string, fields: ExtractionFields | null): Promise<DocumentForensics> {
  const methods: ForensicMethod[] = [];
  const result: DocumentForensics = { checkedAt: new Date().toISOString(), methods, indicators: [], signatures: [] };
  try {
    if (mimeType === "application/pdf") {
      result.signatures = await checkPdfSignatures(file);
      if (result.signatures.length) methods.push("pdf_signature");
      for (const s of result.signatures) {
        if (s.integrity === "invalid") result.indicators.push({ code: "signature_broken", severity: "potential", method: "pdf_signature", message: `A digital signature${s.signer ? ` by ${s.signer}` : ""} no longer matches the document: its content changed after signing.` });
        else if (s.integrity === "valid" && !s.coversWholeFile) result.indicators.push({ code: "changed_after_signing", severity: "potential", method: "pdf_signature", message: `Content was added after ${s.signer ?? "the signer"} signed the document. The added part is not covered by the signature.` });
      }
      if (fields) {
        const layer = await readPdfLayer(file);
        if (layer) {
          methods.push("pdf_text_layer");
          if (layer.annotations.length) methods.push("pdf_annotation");
          result.indicators.push(...analyzePdfLayer(layer, fields));
        }
      }
    } else if (mimeType === "image/jpeg" && fields) {
      const g = await analyzeJpegGhost(file, fields);
      if (g.primaryQuality !== null) methods.push("jpeg_ghost");
      result.indicators.push(...g.indicators);
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
