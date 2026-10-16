// Basic file integrity checks. These produce *potential indicators* only.
// None of them can prove a document is genuine or forged; sophisticated
// forgeries will pass them, and harmless re-saves can trigger them.
import { createHash } from "node:crypto";
import type { IntegrityIndicator, IntegrityResult } from "./types";

export const ALLOWED_TYPES: Record<string, { mime: string; exts: string[] }> = {
  pdf: { mime: "application/pdf", exts: ["pdf"] },
  jpeg: { mime: "image/jpeg", exts: ["jpg", "jpeg"] },
  png: { mime: "image/png", exts: ["png"] },
};

const EDITING_TOOLS = /photoshop|illustrator|gimp|inkscape|canva|pixelmator|affinity|snapseed|picsart|paint\.net|ilovepdf|smallpdf|sejda|pdfescape|pdf-xchange|pdffiller|foxit phantom|nitro pro|acrobat pro/i;

export function detectType(buf: Buffer): keyof typeof ALLOWED_TYPES | null {
  if (buf.length >= 5 && buf.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  return null;
}

export function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

/** Reads a literal "(...)" or hex "<...>" string value from an uncompressed PDF Info dictionary. */
function pdfInfoString(text: string, key: string): string | null {
  const lit = new RegExp(`/${key}\\s*\\(([^)]{0,200})\\)`).exec(text);
  if (lit) return lit[1];
  const hex = new RegExp(`/${key}\\s*<([0-9A-Fa-f]{2,800})>`).exec(text);
  if (!hex) return null;
  const bytes = Buffer.from(hex[1], "hex");
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return Buffer.from(bytes.subarray(2, 2 + ((bytes.length - 2) & ~1))).swap16().toString("utf16le");
  return bytes.toString("latin1");
}

function checkPdf(buf: Buffer, out: IntegrityIndicator[]) {
  const text = buf.toString("latin1");
  const eofCount = (text.match(/%%EOF/g) || []).length;
  if (eofCount > 1) {
    out.push({
      code: "pdf_incremental_update",
      severity: "potential",
      message: `The PDF was saved ${eofCount - 1} more time(s) after it was first created (incremental updates). This is normal for signed or annotated PDFs, but it is also how edits are appended.`,
    });
  }
  const producer = pdfInfoString(text, "Producer");
  const creator = pdfInfoString(text, "Creator");
  for (const [label, v] of [["Producer", producer], ["Creator", creator]] as const) {
    if (v && EDITING_TOOLS.test(v)) {
      out.push({ code: "pdf_editing_software", severity: "potential", message: `PDF ${label} metadata names editing software ("${v}"). The file may have been edited or simply re-exported.` });
    }
  }
  const created = pdfInfoString(text, "CreationDate");
  const modified = pdfInfoString(text, "ModDate");
  if (created && modified && created !== modified) {
    out.push({ code: "pdf_modified_after_creation", severity: "potential", message: `PDF metadata shows a modification date (${modified}) different from its creation date (${created}).` });
  }
  if (!producer && !creator) {
    out.push({ code: "pdf_no_metadata", severity: "info", message: "No producer metadata found (common, and not an indicator by itself)." });
  }
}

function checkJpeg(buf: Buffer, out: IntegrityIndicator[]) {
  // Look for EXIF/XMP software markers in the first 128 KB (APP segments live at the start).
  const head = buf.subarray(0, 128 * 1024).toString("latin1");
  const hasExif = head.includes("Exif\0\0");
  const tool = EDITING_TOOLS.exec(head);
  if (tool) out.push({ code: "image_editing_software", severity: "potential", message: `Image metadata mentions editing software ("${tool[0]}"). The image may have been edited or only re-saved.` });
  if (!hasExif) out.push({ code: "image_no_exif", severity: "info", message: "No camera (EXIF) metadata. Messaging apps and screenshots remove it, so this is not an indicator by itself." });
}

function checkPng(buf: Buffer, out: IntegrityIndicator[]) {
  // Walk PNG chunks and inspect text chunks for a Software entry.
  let off = 8;
  let software: string | null = null;
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.subarray(off + 4, off + 8).toString("latin1");
    if (type === "tEXt" || type === "iTXt") {
      const data = buf.subarray(off + 8, off + 8 + Math.min(len, 2000)).toString("latin1");
      if (data.startsWith("Software\0")) software = data.slice(9).replace(/\0/g, " ").trim();
    }
    if (type === "IEND") break;
    off += 12 + len;
  }
  if (software && EDITING_TOOLS.test(software)) {
    out.push({ code: "image_editing_software", severity: "potential", message: `PNG metadata names editing software ("${software}"). The image may have been edited or only re-saved.` });
  }
}

export function checkIntegrity(buf: Buffer, filename: string): IntegrityResult {
  const indicators: IntegrityIndicator[] = [];
  const detected = detectType(buf);
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  if (detected && !ALLOWED_TYPES[detected].exts.includes(ext)) {
    indicators.push({ code: "extension_mismatch", severity: "potential", message: `The file content is ${detected.toUpperCase()} but the name ends in ".${ext}".` });
  }
  if (detected === "pdf") checkPdf(buf, indicators);
  if (detected === "jpeg") checkJpeg(buf, indicators);
  if (detected === "png") checkPng(buf, indicators);
  return { sha256: sha256(buf), detectedType: detected ?? "unknown", checkedAt: new Date().toISOString(), indicators };
}
