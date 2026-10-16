// Case workflow service: create cases, add documents, extract, run rules,
// record human reviews. Server-only.
import { randomUUID } from "node:crypto";
import { getConfig } from "./config";
import { findSampleByHash, fixtureExtraction, readSampleFile } from "./extraction/demo";
import { extractWithGemini } from "./extraction/gemini";
import { groundExtraction } from "./extraction/grounding";
import { analyzeDocument } from "./forensics";
import { crossCheck } from "./ocr/crosscheck";
import { ocrConfigured, runInkMarkCheck, runOcr, type OcrResult } from "./ocr/paddle";
import { ASSESSOR_VERSION, assessClaims, type ClaimPolicy } from "./claims/assess";
import { validateStated, CLAIM_TYPES, type ClaimProposal } from "./claims/parse";
import { CLAIM_TYPE_LABEL, FIELD_LABEL } from "./labels";
import { decodeVin, VPIC_NAME } from "./registry/nhtsa";
import { lookupVin11, NZTA_NAME } from "./registry/nzta";
import { ALLOWED_TYPES, checkIntegrity, detectType } from "./integrity";
import { normalizeVin } from "./normalize";
import { RULES_VERSION, runRules } from "./rules";
import { SAMPLE_CASES, type SampleCase } from "./samples/definitions";
import { getStore } from "./storage";
import { currentFindings, evidenceKey } from "./derive";
import type { AuditEvent, Case, CaseDocument, Claim, ClaimSource, DocumentForensics, Extraction, ExtractionFields, Provenance, RegistryCheck, Resolution, Vehicle } from "./types";

const MAX_RULE_RUNS = 25;
// A case is one Firestore document (1 MiB limit), so history is capped.
const MAX_EXTRACTION_HISTORY = 5;
const PROVENANCES: Provenance[] = ["seller_provided", "dealer_captured", "dealer_ordered", "unknown"];

export class UserError extends Error {}

function now() {
  return new Date().toISOString();
}

function event(actor: string, type: string, detail: string, at = now()): AuditEvent {
  return { at, actor, type, detail };
}

function safeName(name: string) {
  return name.replace(/[^A-Za-z0-9._-]/g, "_").slice(-80) || "file";
}

/** Rule findings whose topic a claim of each type already covers. */
const CLAIM_COVERS: Record<Claim["type"], string[]> = {
  battery_soh: ["battery-health"],
  odometer: ["current-odometer", "mileage-timeline"],
  accident_history: [],
  fast_charging: [],
};

export function claimPolicy(): ClaimPolicy {
  const cfg = getConfig();
  return {
    sohTolerancePts: cfg.sohTolerancePts,
    batteryReportMaxAgeDays: cfg.batteryReportMaxAgeDays,
    odometerToleranceKm: cfg.odometerToleranceKm,
    odometerFreshDays: cfg.odometerFreshDays,
    chargingTolerancePts: 10,
    accidentHistoryMinMonths: 12,
  };
}

export function evaluateRules(c: Case, trigger: string, actor: string) {
  const cfg = getConfig();
  const input = { vehicle: c.vehicle, documents: c.documents, referenceDate: c.createdAt, registryChecks: c.registryChecks };
  const ruleFindings = runRules(input, { batteryReportMaxAgeDays: cfg.batteryReportMaxAgeDays });
  // Claims are assessed from the same run, so their statuses are versioned with the findings.
  const claimFindings = assessClaims(c.claims, input, ruleFindings, claimPolicy());
  // When a claim covers a topic, its own Unknown says what is missing; the matching
  // rule-level Unknown would only repeat it in Decision impact. Conflicts stay in both.
  const covered = new Set(claimFindings.flatMap((f) => CLAIM_COVERS[f.claim!.type]));
  for (const f of ruleFindings) if (f.status === "unknown" && covered.has(f.id)) f.decisionImpact = false;
  const findings = [...claimFindings, ...ruleFindings];
  c.ruleRuns.push({ id: randomUUID(), at: now(), rulesVersion: RULES_VERSION, assessorVersion: ASSESSOR_VERSION, trigger, findings });
  if (c.ruleRuns.length > MAX_RULE_RUNS) c.ruleRuns = c.ruleRuns.slice(-MAX_RULE_RUNS);
  const counts = findings.reduce<Record<string, number>>((a, f) => ((a[f.status] = (a[f.status] ?? 0) + 1), a), {});
  c.events.push(event(actor, "rules_run", `Rules ${RULES_VERSION} ran (${trigger}): ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ")}.`));
}

// ---------------------------------------------------------------- synthetic cases

async function buildSampleCase(sc: SampleCase): Promise<Case> {
  const store = getStore();
  const cfg = getConfig();
  const c: Case = {
    id: sc.id,
    caseNumber: sc.caseNumber,
    synthetic: true,
    vehicle: { ...sc.vehicle },
    createdAt: sc.createdAt,
    createdBy: "VoltProof demo seed",
    documents: [],
    claims: (sc.claims ?? []).map((cl, i) => ({
      id: `${sc.id}-claim-${i + 1}`,
      type: cl.type,
      stated: cl.stated,
      source: "seller_listing" as const,
      sourceText: cl.sourceText,
      createdBy: "VoltProof demo seed",
      createdAt: sc.createdAt,
    })),
    ruleRuns: [],
    reviews: [],
    events: [event("VoltProof demo seed", "case_created", "Synthetic demonstration case created. All documents and data are fictional.", sc.createdAt)],
  };
  for (const sd of sc.docs) {
    const buf = await readSampleFile(sd);
    const id = `${sc.id}-${sd.id}`;
    const key = `cases/${c.id}/${id}-${sd.filename}`;
    await store.putFile(key, buf, sd.format === "pdf" ? "application/pdf" : sd.format === "jpg" ? "image/jpeg" : "image/png");
    const { fields, warnings } = fixtureExtraction(sd, cfg.minConfidence);
    const mime = sd.format === "pdf" ? "application/pdf" : sd.format === "jpg" ? "image/jpeg" : "image/png";
    const g = await groundExtraction(fields, buf, mime);
    const forensics = await analyzeDocument(buf, mime, fields);
    const extraction: Extraction = { mode: "demo-fixture", model: null, extractedAt: sc.createdAt, fields, warnings, grounding: g.grounding };
    c.documents.push({
      id,
      filename: sd.filename,
      mimeType: mime,
      sizeBytes: buf.length,
      storageKey: key,
      uploadedAt: sc.createdAt,
      uploadedBy: "VoltProof demo seed",
      provenance: sd.provenance,
      sampleId: sd.id,
      integrity: checkIntegrity(buf, sd.filename),
      extractionStatus: "extracted",
      extractionError: null,
      extraction,
      extractionHistory: [],
      forensics,
    });
    c.events.push(event("VoltProof demo seed", "document_added", `${sd.filename} added; extraction loaded from demo fixture (no live AI call).`, sc.createdAt));
  }
  evaluateRules(c, "demo seed", "system");
  return c;
}

const seeded = new WeakMap<object, Promise<void>>();

/** Creates the synthetic demonstration cases once per store if they are missing. */
export async function ensureSeeded() {
  const store = getStore();
  let p = seeded.get(store);
  if (!p) {
    p = (async () => {
      for (const sc of SAMPLE_CASES) {
        if (!(await store.getCase(sc.id))) await store.putCase(await buildSampleCase(sc));
      }
    })().catch((e) => {
      seeded.delete(store);
      throw e;
    });
    seeded.set(store, p);
  }
  return p;
}

export async function resetSampleCase(id: string, actor: string) {
  const sc = SAMPLE_CASES.find((s) => s.id === id);
  if (!sc) throw new UserError("Only synthetic demonstration cases can be reset.");
  const c = await buildSampleCase(sc);
  c.events.push(event(actor, "case_reset", "Synthetic case reset to its original state."));
  await getStore().putCase(c);
  return c;
}

// ---------------------------------------------------------------- queries

export async function listCases() {
  await ensureSeeded();
  const cases = await getStore().listCases();
  return cases.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function getCase(id: string) {
  await ensureSeeded();
  return getStore().getCase(id);
}

// ---------------------------------------------------------------- commands

export async function createCase(input: { make: string; model: string; year: string | number | null; vin: string }, actor: string) {
  const make = input.make.trim();
  const model = input.model.trim();
  const vin = normalizeVin(input.vin ?? "");
  const year = input.year ? Number(input.year) : null;
  if (!make || !model) throw new UserError("Make and model are required.");
  if (make.length > 60 || model.length > 60) throw new UserError("Make or model is too long.");
  if (vin && !/^[A-Z0-9]{6,20}$/.test(vin)) throw new UserError("The VIN may contain only letters and digits.");
  if (year !== null && (!Number.isInteger(year) || year < 2008 || year > new Date().getFullYear() + 1)) throw new UserError("Enter a valid model year.");

  await ensureSeeded();
  const created = now();
  const vehicle: Vehicle = { make, model, year, vin };
  const c: Case = {
    id: randomUUID().replace(/-/g, "").slice(0, 16),
    caseNumber: `VP-${created.slice(0, 4)}-${String(Math.floor(1000 + Math.random() * 9000))}`,
    synthetic: false,
    vehicle,
    createdAt: created,
    createdBy: actor,
    documents: [],
    claims: [],
    ruleRuns: [],
    reviews: [],
    events: [event(actor, "case_created", `Case created for ${year ?? ""} ${make} ${model}${vin ? `, VIN ${vin}` : ""}.`.replace("  ", " "))],
  };
  evaluateRules(c, "case created", "system");
  await getStore().putCase(c);
  return c;
}

export async function addDocument(caseId: string, file: { name: string; data: Buffer }, provenance: string, actor: string) {
  const cfg = getConfig();
  if (!file.data.length) throw new UserError(`${file.name} is empty.`);
  if (file.data.length > cfg.maxUploadBytes) throw new UserError(`${file.name} is larger than ${Math.round(cfg.maxUploadBytes / 1048576)} MB.`);
  const type = detectType(file.data);
  if (!type) throw new UserError(`${file.name} is not a PDF, JPG or PNG file.`);
  const prov = (PROVENANCES as string[]).includes(provenance) ? (provenance as Provenance) : "unknown";

  const id = randomUUID();
  const key = `cases/${caseId}/${id}-${safeName(file.name)}`;
  const integrity = checkIntegrity(file.data, file.name);
  const existing = await getCase(caseId);
  if (!existing) throw new UserError("Case not found.");
  await getStore().putFile(key, file.data, ALLOWED_TYPES[type].mime);
  const doc: CaseDocument = {
    id,
    filename: file.name.slice(0, 120),
    mimeType: ALLOWED_TYPES[type].mime,
    sizeBytes: file.data.length,
    storageKey: key,
    uploadedAt: now(),
    uploadedBy: actor,
    provenance: prov,
    sampleId: null,
    integrity,
    extractionStatus: "pending",
    extractionError: null,
    extraction: null,
    extractionHistory: [],
  };
  await getStore().updateCase(caseId, (c) => {
    const dup = c.documents.find((d) => d.integrity.sha256 === integrity.sha256);
    c.documents.push(doc);
    c.events.push(event(actor, "document_added", `${doc.filename} uploaded (${prov.replace(/_/g, " ")}); SHA-256 ${integrity.sha256.slice(0, 12)}…${dup ? ` — identical to ${dup.filename} already on file` : ""}.`));
  });
  return doc;
}

/**
 * Photos and scans have no text layer to check quotes against, so a second
 * engine (PaddleOCR) reads them too and must agree on the identifiers.
 */
async function secondRead(buf: Buffer, mimeType: string, filename: string, fields: ExtractionFields, grounding: Extraction["grounding"], cache: { ocr?: OcrResult | null }) {
  if (!ocrConfigured() || grounding === "pdf_text") return null;
  try {
    if (cache.ocr === undefined) cache.ocr = await runOcr(buf, mimeType, filename);
    const disagree = crossCheck(fields, cache.ocr!);
    log({ step: "second_read", engine: "paddleocr", disagreements: disagree.length });
    return disagree.length ? ` PaddleOCR disagreed on ${disagree.map((f) => FIELD_LABEL[f].toLowerCase()).join(", ")}; sent to review.` : " PaddleOCR confirmed the identifiers.";
  } catch (e) {
    cache.ocr = null;
    log({ severity: "WARNING", step: "second_read", outcome: "failed", error: e instanceof Error ? e.message : String(e) });
    return " The second OCR read was unavailable.";
  }
}

/**
 * Stamps, seals and signatures: a visible mark proves nothing, but two marks
 * that are pixel-for-pixel identical were pasted digitally. Runs on the OCR service.
 */
async function addInkMarkCheck(forensics: DocumentForensics, buf: Buffer, mimeType: string, filename: string) {
  if (!ocrConfigured()) return;
  try {
    const r = await runInkMarkCheck(buf, mimeType, filename);
    forensics.methods.push("ink_marks");
    for (const p of r.pages) {
      for (const g of p.regions) {
        forensics.indicators.push({
          code: "duplicated_mark",
          severity: "potential",
          method: "ink_marks",
          page: p.page,
          message: `Page ${p.page}: two coloured marks (a stamp, seal or signature) are pixel-for-pixel identical (similarity ${g.similarity.toFixed(3)}). A real stamp or signature never prints exactly the same way twice, so one was copied digitally, unless it is a printed logo.`,
        });
      }
      const n = p.marks.length;
      if (n && !p.regions.length) forensics.indicators.push({ code: "marks_present", severity: "info", method: "ink_marks", page: p.page, message: `Page ${p.page} has ${n} coloured mark${n === 1 ? "" : "s"} (stamp, seal or signature). A visible mark is not proof of authenticity.` });
    }
  } catch (e) {
    log({ severity: "WARNING", step: "ink_marks", outcome: "failed", error: e instanceof Error ? e.message : String(e) });
  }
}

function log(entry: Record<string, unknown>) {
  // One JSON line per pipeline step; Cloud Logging parses these. Never document text or values.
  console.log(JSON.stringify({ severity: "INFO", ...entry }));
}

/**
 * Live extraction: Gemini reads the file, then every quote is checked against
 * the document's text. If the primary model fails, or some of its quotes cannot
 * be found, the optional fallback model gets one try and the better result is kept.
 */
async function extractLive(buf: Buffer, mimeType: string, filename: string): Promise<{ extraction: Extraction; detail: string; forensics: DocumentForensics }> {
  const cfg = getConfig();
  const forensicsByModel = new Map<string, DocumentForensics>();
  const ocrCache: { ocr?: OcrResult | null } = {};
  const notes = new Map<string, string>();
  const attempt = async (model: string) => {
    const r = await extractWithGemini(buf, mimeType, cfg, model);
    const g = await groundExtraction(r.fields, buf, mimeType);
    notes.set(model, (await secondRead(buf, mimeType, filename, r.fields, g.grounding, ocrCache)) ?? "");
    const fx = await analyzeDocument(buf, mimeType, r.fields);
    if (!forensicsByModel.size) await addInkMarkCheck(fx, buf, mimeType, filename);
    forensicsByModel.set(model, fx);
    log({ step: "extract", model, latencyMs: r.usage.latencyMs, attempts: r.usage.attempts, inputTokens: r.usage.inputTokens, outputTokens: r.usage.outputTokens, grounding: g.grounding, quotesNotFound: g.notFound });
    const extraction: Extraction = { mode: "vertex-gemini", model, extractedAt: now(), fields: r.fields, warnings: r.warnings, usage: r.usage, grounding: g.grounding };
    return { extraction, notFound: g.notFound };
  };
  let primary: Awaited<ReturnType<typeof attempt>> | null = null;
  let primaryError: unknown = null;
  try {
    primary = await attempt(cfg.geminiModel);
  } catch (e) {
    primaryError = e;
    log({ severity: "WARNING", step: "extract", model: cfg.geminiModel, outcome: "failed", error: e instanceof Error ? e.message : String(e) });
  }
  const fallback = cfg.geminiFallbackModel && cfg.geminiFallbackModel !== cfg.geminiModel ? cfg.geminiFallbackModel : null;
  if (fallback && (!primary || primary.notFound > 0)) {
    try {
      const second = await attempt(fallback);
      if (!primary || second.notFound < primary.notFound) {
        return { extraction: second.extraction, forensics: forensicsByModel.get(fallback)!, detail: `Read by ${fallback} on Vertex AI (fallback after ${primary ? `${primary.notFound} quote(s) not found` : "a failed call"} with ${cfg.geminiModel}).` };
      }
    } catch (e) {
      log({ severity: "WARNING", step: "extract", model: fallback, outcome: "failed", error: e instanceof Error ? e.message : String(e) });
    }
  }
  if (!primary) throw primaryError instanceof Error ? primaryError : new Error(String(primaryError));
  const g = primary.extraction.grounding === "pdf_text" ? `; quotes checked against the PDF text${primary.notFound ? `, ${primary.notFound} not found and excluded` : ""}` : "; quotes not machine-checked (image)";
  return { extraction: primary.extraction, forensics: forensicsByModel.get(cfg.geminiModel)!, detail: `Read by ${cfg.geminiModel} on Vertex AI (live call, ${(primary.extraction.usage!.latencyMs / 1000).toFixed(1)} s${g}).${notes.get(cfg.geminiModel) ?? ""}` };
}

export async function processDocument(caseId: string, docId: string, actor: string) {
  const cfg = getConfig();
  const store = getStore();
  const c0 = await getCase(caseId);
  const doc0 = c0?.documents.find((d) => d.id === docId);
  if (!c0 || !doc0) throw new UserError("Document not found.");

  await store.updateCase(caseId, (c) => {
    const d = c.documents.find((x) => x.id === docId)!;
    d.extractionStatus = "processing";
  });

  let extraction: Extraction | null = null;
  let status: CaseDocument["extractionStatus"];
  let error: string | null = null;
  let sampleId: string | null = doc0.sampleId;
  let detail: string;
  let forensics: DocumentForensics | null = null;

  try {
    const buf = await store.getFile(doc0.storageKey);
    if (!buf) throw new Error("Stored file is missing.");
    if (cfg.aiMode === "vertex") {
      const live = await extractLive(buf, doc0.mimeType, doc0.filename);
      extraction = live.extraction;
      forensics = live.forensics;
      status = "extracted";
      detail = live.detail;
    } else {
      const sample = await findSampleByHash(doc0.integrity.sha256);
      if (sample) {
        const { fields, warnings } = fixtureExtraction(sample, cfg.minConfidence);
        const g = await groundExtraction(fields, buf, doc0.mimeType);
        const ocrNote = await secondRead(buf, doc0.mimeType, doc0.filename, fields, g.grounding, {});
        forensics = await analyzeDocument(buf, doc0.mimeType, fields);
        await addInkMarkCheck(forensics, buf, doc0.mimeType, doc0.filename);
        extraction = { mode: "demo-fixture", model: null, extractedAt: now(), fields, warnings, grounding: g.grounding };
        sampleId = sample.id;
        status = "extracted";
        detail = `Matched synthetic sample "${sample.filename}" by SHA-256; demo fixture loaded (no live AI call).${ocrNote ?? ""}`;
      } else {
        // Not read, but the signature check needs no extraction.
        forensics = await analyzeDocument(buf, doc0.mimeType, null);
        await addInkMarkCheck(forensics, buf, doc0.mimeType, doc0.filename);
        status = "not_configured";
        error = "AI extraction is not configured (demo mode). The file was stored and fingerprinted but not read.";
        detail = "Not read: demo mode only reads the built-in synthetic sample documents.";
      }
    }
  } catch (e) {
    status = "failed";
    error = e instanceof Error ? e.message : String(e);
    detail = `Extraction failed: ${error}`;
  }

  return store.updateCase(caseId, (c) => {
    const d = c.documents.find((x) => x.id === docId)!;
    if (d.extraction) d.extractionHistory.push(d.extraction);
    if (d.extractionHistory.length > MAX_EXTRACTION_HISTORY) d.extractionHistory = d.extractionHistory.slice(-MAX_EXTRACTION_HISTORY);
    d.extraction = extraction ?? d.extraction;
    d.extractionStatus = status;
    d.extractionError = error;
    d.sampleId = sampleId;
    if (forensics) d.forensics = forensics;
    const found = forensics?.indicators.filter((i) => i.severity === "potential").length ?? 0;
    c.events.push(event(actor, "document_extracted", `${d.filename}: ${detail}${found ? ` Forensic checks found ${found} possible sign${found === 1 ? "" : "s"} of editing.` : ""}`));
    evaluateRules(c, `document processed: ${d.filename}`, "system");
  });
}

const RESOLUTIONS: Resolution[] = ["resolved", "unresolved", "more_info_requested"];

export async function addReview(caseId: string, findingId: string, input: { resolution: string; note: string }, actor: string) {
  if (!(RESOLUTIONS as string[]).includes(input.resolution)) throw new UserError("Choose a resolution.");
  const note = input.note.trim();
  if (note.length < 3) throw new UserError("Add a short note explaining the decision.");
  if (note.length > 2000) throw new UserError("The note is too long (2,000 characters max).");
  await ensureSeeded();
  return getStore().updateCase(caseId, (c) => {
    const run = c.ruleRuns[c.ruleRuns.length - 1];
    const f = currentFindings(c).find((x) => x.id === findingId);
    if (!run || !f) throw new UserError("That finding no longer exists in the latest rule run.");
    c.reviews.push({
      id: randomUUID(),
      findingId,
      ruleRunId: run.id,
      findingSnapshot: { title: f.title, status: f.status, result: f.result, evidenceKey: evidenceKey(f) },
      resolution: input.resolution as Resolution,
      note,
      reviewer: actor,
      at: now(),
    });
    c.events.push(event(actor, "review_recorded", `${f.title}: marked ${input.resolution.replace(/_/g, " ")}. Machine finding (${f.status}) unchanged.`));
  });
}

// ---------------------------------------------------------------- seller claims

const MAX_CLAIMS = 10;
const SOURCES: ClaimSource[] = ["seller_listing", "seller_form", "manual"];

export interface ClaimInput {
  type: string;
  stated: { number?: unknown; unit?: unknown; flag?: unknown; text?: unknown };
  sourceText?: unknown;
  source?: unknown;
}

function cleanClaim(input: ClaimInput): ClaimProposal & { source: ClaimSource } {
  if (!(CLAIM_TYPES as string[]).includes(input.type)) throw new UserError("Unknown claim type.");
  const type = input.type as ClaimProposal["type"];
  const s = input.stated ?? {};
  const stated: ClaimProposal["stated"] = {};
  if (s.number !== undefined && s.number !== null && s.number !== "") stated.number = Number(s.number);
  if (typeof s.flag === "boolean") stated.flag = s.flag;
  if (typeof s.text === "string" && s.text.trim()) stated.text = s.text.trim().slice(0, 120);
  if (type === "odometer") stated.unit = s.unit === "mi" ? "mi" : "km";
  else if (type !== "accident_history") stated.unit = "%";
  const err = validateStated(type, stated);
  if (err) throw new UserError(`${CLAIM_TYPE_LABEL[type]}: ${err}`);
  const sourceText = typeof input.sourceText === "string" && input.sourceText.trim() ? input.sourceText.trim().slice(0, 300) : "";
  const source = (SOURCES as unknown[]).includes(input.source) ? (input.source as ClaimSource) : sourceText ? "seller_listing" : "manual";
  return { type, stated, sourceText, source };
}

/**
 * Adds confirmed seller claims. A new claim of a type already on the case
 * replaces (withdraws) the earlier one, so each type has one active claim.
 */
export async function addClaims(caseId: string, inputs: ClaimInput[], actor: string) {
  if (!Array.isArray(inputs) || inputs.length === 0) throw new UserError("Add at least one claim.");
  if (inputs.length > MAX_CLAIMS) throw new UserError(`At most ${MAX_CLAIMS} claims at a time.`);
  const cleaned = inputs.map(cleanClaim);
  const types = cleaned.map((c) => c.type);
  if (new Set(types).size !== types.length) throw new UserError("Only one claim of each type can be added at a time.");
  await ensureSeeded();
  if (!(await getStore().getCase(caseId))) throw new UserError("Case not found.");
  return getStore().updateCase(caseId, (c) => {
    c.claims ??= [];
    const at = now();
    for (const cl of cleaned) {
      for (const old of c.claims.filter((x) => x.type === cl.type && !x.withdrawn)) old.withdrawn = true;
      const claim: Claim = { id: randomUUID().slice(0, 8), type: cl.type, stated: cl.stated, source: cl.source, sourceText: cl.sourceText || null, createdBy: actor, createdAt: at };
      c.claims.push(claim);
      c.events.push(event(actor, "claim_added", `Seller claim recorded: ${CLAIM_TYPE_LABEL[cl.type]}${cl.sourceText ? ` (“${cl.sourceText}”)` : ""}.`));
    }
    evaluateRules(c, "claims updated", "system");
  });
}

/** Withdraws a claim. It is kept for the audit trail but no longer assessed. */
export async function withdrawClaim(caseId: string, claimId: string, actor: string) {
  await ensureSeeded();
  return getStore().updateCase(caseId, (c) => {
    const cl = (c.claims ?? []).find((x) => x.id === claimId && !x.withdrawn);
    if (!cl) throw new UserError("Claim not found.");
    cl.withdrawn = true;
    c.events.push(event(actor, "claim_withdrawn", `Seller claim withdrawn: ${CLAIM_TYPE_LABEL[cl.type]}.`));
    evaluateRules(c, "claims updated", "system");
  });
}

// ---------------------------------------------------------------- registry checks

const MAX_REGISTRY_CHECKS = 10;

/**
 * Checks the case VIN against an external reference and re-runs the rules with
 * the result as evidence: NHTSA vPIC (what the VIN encodes) or the NZ Motor
 * Vehicle Register open data (what the government register records for this VIN prefix).
 */
export async function runRegistryCheck(caseId: string, provider: "nhtsa_vpic" | "nzta_mvr", actor: string, fetchImpl: typeof fetch = fetch) {
  await ensureSeeded();
  const c0 = await getStore().getCase(caseId);
  if (!c0) throw new UserError("Case not found.");
  const vin = normalizeVin(c0.vehicle.vin ?? "");
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) throw new UserError("Enter a 17-character VIN on the case first.");
  const r = provider === "nzta_mvr" ? await lookupVin11(vin, fetchImpl) : await decodeVin(vin, c0.vehicle.year, fetchImpl);
  log({ step: "registry_check", provider, outcome: r.outcome });
  const check: RegistryCheck = {
    id: randomUUID(),
    provider,
    providerName: provider === "nzta_mvr" ? NZTA_NAME : VPIC_NAME,
    kind: provider === "nzta_mvr" ? "register_match" : "vin_decode",
    query: { vin },
    checkedAt: now(),
    checkedBy: actor,
    outcome: r.outcome,
    data: r.data,
    message: r.message,
    sourceUrl: r.sourceUrl,
  };
  return getStore().updateCase(caseId, (c) => {
    c.registryChecks = [...(c.registryChecks ?? []), check].slice(-MAX_REGISTRY_CHECKS);
    const what = r.outcome === "ok" ? (provider === "nzta_mvr" ? r.message : [r.data.modelYear, r.data.make, r.data.model].filter(Boolean).join(" ")) : r.message;
    c.events.push(event(actor, "registry_check", `${check.providerName}: ${what}`));
    evaluateRules(c, `${check.providerName} checked`, "system");
  });
}

/** Kept for existing callers and tests. */
export function runVinDecode(caseId: string, actor: string, fetchImpl: typeof fetch = fetch) {
  return runRegistryCheck(caseId, "nhtsa_vpic", actor, fetchImpl);
}

// ---------------------------------------------------------------- issuer verification

const VERIFICATION_METHODS = ["issuer_phone", "issuer_email", "issuer_portal", "registry_lookup", "government_document_number"] as const;
const VERIFICATION_OUTCOMES = ["confirmed", "denied", "no_response"] as const;

/**
 * Records that a person checked a document with its issuer or a registry.
 * Append-only: a later record supersedes an earlier one, and both stay in the history.
 */
export async function addVerification(
  caseId: string,
  docId: string,
  input: { method?: unknown; outcome?: unknown; contact?: unknown; reference?: unknown; note?: unknown },
  actor: string,
) {
  const method = VERIFICATION_METHODS.find((m) => m === input.method);
  const outcome = VERIFICATION_OUTCOMES.find((o) => o === input.outcome);
  if (!method) throw new UserError("Choose how the document was checked.");
  if (!outcome) throw new UserError("Choose what the issuer said.");
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const contact = str(input.contact, 200);
  const reference = str(input.reference, 120);
  const note = str(input.note, 2000);
  if (contact.length < 3) throw new UserError("Say who you contacted (organisation, and person or channel).");
  if (outcome === "confirmed" && !reference && note.length < 5) throw new UserError("Add the reference number they gave, or a note on what they confirmed.");
  await ensureSeeded();
  return getStore().updateCase(caseId, (c) => {
    const d = c.documents.find((x) => x.id === docId);
    if (!d) throw new UserError("Document not found.");
    d.verifications ??= [];
    d.verifications.push({ id: randomUUID(), method, outcome, contact, reference, note, by: actor, at: now() });
    const said = outcome === "confirmed" ? "confirmed it issued the document" : outcome === "denied" ? "said it did NOT issue the document" : "did not respond";
    c.events.push(event(actor, "issuer_verification", `${d.filename}: ${contact} ${said} (${method.replace(/_/g, " ")}${reference ? `, ref. ${reference}` : ""}).`));
    evaluateRules(c, `issuer verification: ${d.filename}`, "system");
  });
}
