// Renders the synthetic sample documents into /samples.
// Run: npm run samples   (output is committed so the app works without this step)
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import sharp from "sharp";
import { SAMPLE_DOCS, type SampleDoc } from "../src/lib/samples/definitions";
import { createDemoSigner, signPdf, type DemoSigner } from "./lib/pdf-sign";

const OUT = path.join(process.cwd(), "samples");
const FIXED_DATE = new Date("2026-10-01T00:00:00Z");

function wrap(text: string, maxWidth: number, width: (s: string) => number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (width(next) > maxWidth && cur) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

type LinePos = { page: number; x: number; y: number };

async function renderPdf(doc: SampleDoc, positions: Map<string, LinePos>): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(doc.filename);
  pdf.setProducer("VoltProof synthetic sample generator");
  pdf.setCreator("VoltProof synthetic sample generator");
  pdf.setCreationDate(FIXED_DATE);
  pdf.setModificationDate(FIXED_DATE);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mono = doc.monoValue ? await pdf.embedFont(StandardFonts.Courier) : null;

  doc.pages.forEach((lines, i) => {
    const page = pdf.addPage([595, 842]);
    let y = 790;
    const left = 56;
    const maxW = 595 - left * 2;
    for (const line of lines) {
      if (line === "") {
        y -= 12;
        continue;
      }
      if (line.startsWith("SYNTHETIC SAMPLE")) {
        page.drawRectangle({ x: left - 6, y: y - 6, width: maxW + 12, height: 20, color: rgb(1, 0.93, 0.8) });
        page.drawText(line, { x: left, y, size: 9, font: bold, color: rgb(0.55, 0.3, 0) });
        y -= 34;
        continue;
      }
      if (line.startsWith("# ")) {
        page.drawText(line.slice(2), { x: left, y, size: 18, font: bold, color: rgb(0.06, 0.12, 0.24) });
        y -= 10;
        page.drawLine({ start: { x: left, y }, end: { x: left + maxW, y }, thickness: 1, color: rgb(0.75, 0.8, 0.88) });
        y -= 22;
        continue;
      }
      positions.set(line, { page: i, x: left, y });
      if (mono && doc.monoValue!.line === line) {
        // The label in the document font, the value in Courier: what typing over a PDF in an editor leaves behind.
        const prefix = line.slice(0, line.indexOf(doc.monoValue!.value));
        page.drawText(prefix, { x: left, y, size: 11, font, color: rgb(0.1, 0.1, 0.12) });
        page.drawText(doc.monoValue!.value, { x: left + font.widthOfTextAtSize(prefix, 11), y, size: 10.5, font: mono, color: rgb(0.1, 0.1, 0.12) });
        y -= 17;
        continue;
      }
      for (const l of wrap(line, maxW, (s) => font.widthOfTextAtSize(s, 11))) {
        page.drawText(l, { x: left, y, size: 11, font, color: rgb(0.1, 0.1, 0.12) });
        y -= 17;
      }
    }
    page.drawText(`Page ${i + 1} of ${doc.pages.length}`, { x: left, y: 40, size: 9, font, color: rgb(0.45, 0.45, 0.5) });
  });
  return pdf.save({ useObjectStreams: false });
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
}

/** Cover-and-retype edits, made the way a PDF editor would: a white box, then new text on top. */
async function applyEdits(bytes: Uint8Array, doc: SampleDoc, positions: Map<string, LinePos>): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(bytes);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const e of doc.edits ?? []) {
    const pos = positions.get(e.line);
    if (!pos) throw new Error(`edit line not found: ${e.line}`);
    const page = pdf.getPage(pos.page);
    const x = pos.x + font.widthOfTextAtSize(e.line.slice(0, e.line.indexOf(e.from)), 11);
    page.drawRectangle({ x: x - 1, y: pos.y - 3, width: font.widthOfTextAtSize(e.from, 11) + 2, height: 14, color: rgb(1, 1, 1) });
    page.drawText(e.to, { x, y: pos.y, size: 11, font, color: rgb(0.1, 0.1, 0.12) });
  }
  pdf.setModificationDate(new Date("2026-10-02T21:14:00Z"));
  return pdf.save({ useObjectStreams: false });
}

function dashboardSvg(odometerText: string, overlay: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800">
  <defs>
    <radialGradient id="bg" cx="50%" cy="45%" r="75%"><stop offset="0" stop-color="#2a2f36"/><stop offset="1" stop-color="#0b0d10"/></radialGradient>
    <linearGradient id="screen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#10161f"/><stop offset="1" stop-color="#05080c"/></linearGradient>
  </defs>
  <rect width="1200" height="800" fill="url(#bg)"/>
  <rect x="150" y="170" width="900" height="420" rx="48" fill="#1b1f25" stroke="#3a414b" stroke-width="6"/>
  <rect x="190" y="210" width="820" height="340" rx="30" fill="url(#screen)"/>
  <circle cx="380" cy="380" r="120" fill="none" stroke="#2b3a4d" stroke-width="14"/>
  <path d="M 295 465 A 120 120 0 1 1 465 465" fill="none" stroke="#4aa3ff" stroke-width="14" stroke-linecap="round"/>
  <text x="380" y="395" font-family="Helvetica, Arial, sans-serif" font-size="64" fill="#e8eef6" text-anchor="middle">0</text>
  <text x="380" y="435" font-family="Helvetica, Arial, sans-serif" font-size="22" fill="#8fa3b8" text-anchor="middle">km/h</text>
  <text x="560" y="330" font-family="Helvetica, Arial, sans-serif" font-size="24" fill="#8fa3b8">ODO</text>
  <text x="560" y="400" font-family="Menlo, Courier New, monospace" font-size="68" fill="#e8eef6">${esc(odometerText)}</text>
  <text x="560" y="450" font-family="Helvetica, Arial, sans-serif" font-size="22" fill="#5f7286">READY</text>
  <rect x="0" y="0" width="1200" height="54" fill="#ffefcc"/>
  <text x="24" y="36" font-family="Helvetica, Arial, sans-serif" font-size="24" font-weight="bold" fill="#8a4b00">SYNTHETIC SAMPLE - FICTIONAL DATA FOR DEMONSTRATION ONLY</text>
  <rect x="24" y="712" width="640" height="56" rx="8" fill="#000" fill-opacity="0.6"/>
  <text x="44" y="750" font-family="Helvetica, Arial, sans-serif" font-size="28" fill="#ffffff">${esc(overlay)}</text>
</svg>`;
  return svg;
}

async function renderPhoto(doc: SampleDoc): Promise<Buffer> {
  const { odometerText, overlay, pastedOdometerText } = doc.photo!;
  const svg = dashboardSvg(odometerText, overlay);
  if (doc.format === "png") return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
  // A phone camera saves once at about quality 75.
  const camera = await sharp(Buffer.from(svg)).jpeg({ quality: 75 }).toBuffer();
  if (!pastedOdometerText) return camera;
  // Retouch: paint a clean patch with other digits over the odometer, then re-save at high quality.
  const patch = await sharp({ create: { width: 360, height: 90, channels: 3, background: "#05080c" } })
    .composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="360" height="90"><text x="0" y="68" font-family="Menlo, Courier New, monospace" font-size="68" fill="#e8eef6">${esc(pastedOdometerText)}</text></svg>`), top: 0, left: 0 }])
    .png()
    .toBuffer();
  return sharp(camera).composite([{ input: patch, left: 560, top: 332 }]).jpeg({ quality: 92 }).toBuffer();
}

async function main() {
  await mkdir(OUT, { recursive: true });
  // Demo signing certificates: created fresh on every run and written to the trust list.
  const signers = new Map<string, DemoSigner>();
  for (const name of new Set(SAMPLE_DOCS.map((d) => d.signedBy).filter((x): x is string => !!x))) signers.set(name, await createDemoSigner(name, name));
  for (const doc of SAMPLE_DOCS) {
    let bytes: Uint8Array;
    if (doc.format === "pdf") {
      const positions = new Map<string, LinePos>();
      bytes = await renderPdf(doc, positions);
      if (doc.signedBy) bytes = await signPdf(bytes, signers.get(doc.signedBy)!, new Date(`${doc.truth.documentDate ?? "2026-09-01"}T16:00:00Z`));
      if (doc.edits?.length) bytes = await applyEdits(bytes, doc, positions);
    } else bytes = await renderPhoto(doc);
    await writeFile(path.join(OUT, doc.filename), bytes);
    console.log(`wrote samples/${doc.filename} (${bytes.length} bytes)`);
  }
  const trust = {
    note: "Trust list of known issuer signing certificates (SHA-256 of the DER certificate). The entries below are SYNTHETIC demo certificates created by `npm run samples`; replace them with real issuers' certificates after confirming each with the issuer.",
    signers: [...signers.values()].map((s) => ({ name: s.name, sha256: s.sha256, note: "Synthetic demo certificate" })),
  };
  await mkdir(path.join(process.cwd(), "trust"), { recursive: true });
  await writeFile(path.join(process.cwd(), "trust", "trusted-signers.json"), JSON.stringify(trust, null, 2) + "\n");
  console.log(`wrote trust/trusted-signers.json (${trust.signers.length} demo signer${trust.signers.length === 1 ? "" : "s"})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
