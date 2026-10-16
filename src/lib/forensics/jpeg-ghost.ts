// JPEG ghost analysis (Farid, "Exposing Digital Forgeries from JPEG Ghosts", 2009).
//
// A camera photo is compressed once at some quality Q. Recompressing it at Q
// changes it very little, so its error dips at Q. A region pasted in later was
// never compressed at Q, so it shows no dip there. We find Q from the photo
// itself, then compare each value's region (from the extraction's bounding
// box) with the rest of the photo. Error level analysis (ELA) at one quality
// alone cannot separate edits from ordinary sharp text; the ghost can.
//
// Technique credits: ELA as used in DocAuth (github.com/trinity652/DocAuth,
// MIT); JPEG ghosts from Farid (2009). Implemented here from the papers.
import sharp from "sharp";
import { FIELD_LABEL } from "../labels";
import type { ExtractionFields, FieldName, ForensicIndicator } from "../types";

const BLOCK = 16;
const QUALITIES = [55, 60, 65, 70, 75, 80, 85];
const REFERENCE_Q = 95;

interface ErrorMap {
  bw: number;
  bh: number;
  width: number;
  height: number;
  blocks: Float32Array;
}

async function errorMap(raw: { data: Buffer; width: number; height: number }, source: Buffer, quality: number): Promise<ErrorMap> {
  const re = await sharp(await sharp(source).jpeg({ quality }).toBuffer()).removeAlpha().raw().toBuffer();
  const { width, height, data } = raw;
  const bw = Math.floor(width / BLOCK);
  const bh = Math.floor(height / BLOCK);
  const blocks = new Float32Array(bw * bh);
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      let s = 0;
      for (let y = by * BLOCK; y < by * BLOCK + BLOCK; y++) {
        const row = y * width;
        for (let x = bx * BLOCK; x < bx * BLOCK + BLOCK; x++) {
          const i = (row + x) * 3;
          s += Math.abs(data[i] - re[i]) + Math.abs(data[i + 1] - re[i + 1]) + Math.abs(data[i + 2] - re[i + 2]);
        }
      }
      blocks[by * bw + bx] = s / (BLOCK * BLOCK * 3);
    }
  }
  return { bw, bh, width, height, blocks };
}

function median(xs: number[]) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[s.length >> 1];
}

/** Blocks covering a 0–1000 box. */
function blocksIn(m: ErrorMap, box: [number, number, number, number]) {
  const [ymin, xmin, ymax, xmax] = box;
  const y0 = Math.floor(((ymin / 1000) * m.height) / BLOCK);
  const y1 = Math.ceil(((ymax / 1000) * m.height) / BLOCK);
  const x0 = Math.floor(((xmin / 1000) * m.width) / BLOCK);
  const x1 = Math.ceil(((xmax / 1000) * m.width) / BLOCK);
  const idx: number[] = [];
  for (let y = Math.max(0, y0); y < Math.min(m.bh, y1); y++) for (let x = Math.max(0, x0); x < Math.min(m.bw, x1); x++) idx.push(y * m.bw + x);
  return idx;
}

export interface GhostResult {
  /** The quality the photo appears to have been compressed at first, if a clear dip exists. */
  primaryQuality: number | null;
  indicators: ForensicIndicator[];
  /** Ratio of error at the primary quality to error at the reference quality, per field (1 ≈ no dip). */
  fieldRatios: Partial<Record<FieldName, number>>;
  /** PNG: the photo with areas that lack its compression history tinted red. */
  heatmap?: Buffer;
}

export async function analyzeJpegGhost(file: Buffer, fields: ExtractionFields): Promise<GhostResult> {
  const raw = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const img = { data: raw.data, width: raw.info.width, height: raw.info.height };
  const ref = await errorMap(img, file, REFERENCE_Q);
  // Textured blocks carry the signal; flat areas compress to nothing at every quality.
  const textured = Array.from(ref.blocks.keys()).filter((i) => ref.blocks[i] > 0.15);
  if (textured.length < 20) return { primaryQuality: null, indicators: [], fieldRatios: {} };

  const maps = new Map<number, ErrorMap>();
  const global = new Map<number, number>();
  for (const q of QUALITIES) {
    const m = await errorMap(img, file, q);
    maps.set(q, m);
    global.set(q, median(textured.map((i) => m.blocks[i] / (ref.blocks[i] + 0.05))));
  }
  // The first-save quality shows up as a dip: lower error than at the qualities either side.
  let best: { q: number; depth: number } | null = null;
  for (let k = 1; k < QUALITIES.length - 1; k++) {
    const q = QUALITIES[k];
    const depth = global.get(q)! / Math.min(global.get(QUALITIES[k - 1])!, global.get(QUALITIES[k + 1])!);
    if (depth < 0.85 && (!best || depth < best.depth)) best = { q, depth };
  }
  // No dip: the photo was not saved at a lower quality first, so there is no ghost to compare.
  if (!best) return { primaryQuality: null, indicators: [], fieldRatios: {} };
  const k = QUALITIES.indexOf(best.q);
  const at = maps.get(best.q)!;
  const lo = maps.get(QUALITIES[k - 1])!;
  const hi = maps.get(QUALITIES[k + 1])!;
  /** How strongly a set of blocks dips at the first-save quality: well below 1 = carries the photo's history. */
  const dip = (idx: number[]) => median(idx.filter((i) => ref.blocks[i] > 0.15).map((i) => at.blocks[i] / ((lo.blocks[i] + hi.blocks[i]) / 2 + 0.05)));

  const indicators: ForensicIndicator[] = [];
  const fieldRatios: GhostResult["fieldRatios"] = {};
  for (const name of Object.keys(fields) as FieldName[]) {
    const f = fields[name];
    if (!f || f.value === null || !f.box || name === "documentType") continue;
    const idx = blocksIn(at, f.box);
    if (idx.filter((i) => ref.blocks[i] > 0.15).length < 3) continue;
    const inside = new Set(idx);
    const fieldDip = dip(idx);
    const restDip = dip(textured.filter((i) => !inside.has(i)));
    fieldRatios[name] = Math.round(fieldDip * 100) / 100;
    if (restDip < 0.8 && fieldDip > Math.max(0.85, restDip + 0.2)) {
      indicators.push({
        code: "jpeg_ghost_mismatch",
        severity: "potential",
        method: "jpeg_ghost",
        field: name,
        page: 1,
        message: `${FIELD_LABEL[name] ?? name}: the area showing this value does not carry the compression history of the rest of the photo (the photo was first saved at about quality ${best.q}; this area was not). This is what a pasted-in or retouched value looks like.`,
      });
    }
  }
  // Heat map for the reviewer: within each flagged value's area, red where a textured
  // block does not dip at the first-save quality; the area itself is outlined.
  const flagged = indicators.map((i) => fields[i.field!]?.box).filter((b): b is [number, number, number, number] => !!b);
  const inFlagged = new Set(flagged.flatMap((b) => blocksIn(at, b)));
  const tint = Buffer.alloc(at.bw * at.bh * 4);
  for (const i of inFlagged) {
    if (ref.blocks[i] <= 0.15) continue;
    const d = at.blocks[i] / ((lo.blocks[i] + hi.blocks[i]) / 2 + 0.05);
    const a = Math.max(0, Math.min(1, (d - 0.75) / 0.35));
    tint[i * 4] = 235;
    tint[i * 4 + 1] = 45;
    tint[i * 4 + 2] = 45;
    tint[i * 4 + 3] = Math.round(a * 190);
  }
  const W = at.bw * BLOCK;
  const H = at.bh * BLOCK;
  const outlines = flagged
    .map(([y0, x0, y1, x1]) => `<rect x="${(x0 / 1000) * W - 6}" y="${(y0 / 1000) * H - 6}" width="${((x1 - x0) / 1000) * W + 12}" height="${((y1 - y0) / 1000) * H + 12}" fill="none" stroke="#ff3b30" stroke-width="5" rx="6"/>`)
    .join("");
  const overlay = await sharp(tint, { raw: { width: at.bw, height: at.bh, channels: 4 } })
    .resize(W, H, { kernel: "nearest" })
    .composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${outlines}</svg>`) }])
    .png()
    .toBuffer();
  // Two steps: sharp resizes before compositing, so compose at full size first.
  const base = await sharp(file)
    .removeAlpha()
    .extract({ left: 0, top: 0, width: at.bw * BLOCK, height: at.bh * BLOCK })
    .modulate({ saturation: 0.35, brightness: 0.9 })
    .composite([{ input: overlay }])
    .png()
    .toBuffer();
  const heatmap = await sharp(base).resize({ width: Math.min(960, at.bw * BLOCK) }).png().toBuffer();
  return { primaryQuality: best.q, indicators, fieldRatios, heatmap };
}
