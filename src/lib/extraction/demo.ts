// Demo-mode extraction: hand-written fixtures for the built-in synthetic
// sample documents. Clearly labelled "demo-fixture"; never presented as a
// live model call.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { SAMPLE_DOCS, type SampleDoc } from "../samples/definitions";
import { emptyRaw, normalizeExtraction, type RawExtraction } from "./schema";
import type { FieldName } from "../types";

export const SAMPLES_DIR = path.join(process.cwd(), "samples");

export function fixtureRaw(doc: SampleDoc): RawExtraction {
  const raw = emptyRaw() as unknown as Record<FieldName, { value: unknown; page: number | null; quote: string | null; confidence: number | null; box?: number[] | null }>;
  for (const [name, value] of Object.entries(doc.truth) as [FieldName, unknown][]) {
    const c = doc.cite[name];
    raw[name] = { value, page: c?.page ?? null, quote: c?.quote ?? null, confidence: c?.confidence ?? null, box: c?.box ?? null };
  }
  return raw as unknown as RawExtraction;
}

export function fixtureExtraction(doc: SampleDoc, minConfidence: number) {
  return normalizeExtraction(fixtureRaw(doc), minConfidence);
}

export async function readSampleFile(doc: SampleDoc): Promise<Buffer> {
  return readFile(path.join(SAMPLES_DIR, doc.filename));
}

let hashIndex: Map<string, SampleDoc> | null = null;

/** Finds the sample document whose file bytes match exactly (by SHA-256). */
export async function findSampleByHash(sha256: string): Promise<SampleDoc | null> {
  if (!hashIndex) {
    const idx = new Map<string, SampleDoc>();
    for (const doc of SAMPLE_DOCS) {
      try {
        const buf = await readSampleFile(doc);
        idx.set(createHash("sha256").update(buf).digest("hex"), doc);
      } catch {
        // sample file missing; run `npm run samples`
      }
    }
    hashIndex = idx;
  }
  return hashIndex.get(sha256) ?? null;
}
