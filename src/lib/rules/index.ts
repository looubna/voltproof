// Deterministic validation rules. The LLM never sets a status: every status
// below is computed from extracted, cited fields by ordinary code.
//
// Safety conventions:
// - A missing value is never treated as a conflict; it leads to "unknown".
// - Fields marked unsupported (no quote or low confidence) are excluded from
//   the checks and listed as excluded evidence, so a misread cannot create or
//   hide a conflict silently.
//
// Wording comes from a RuleText (src/i18n/rules). Findings are stored in English,
// the default; pages re-run the same rules with another language's RuleText to
// show them in the reader's language (src/lib/localize.ts).

import { en as EN, type DocumentIssue, type RuleText } from "../../i18n/rules/en";
import {
  daysBetween,
  isWellFormedVin,
  modelsMatch,
  normalizeMake,
  normalizeVin,
  parseIsoDate,
  toKm,
  vinTail,
} from "../normalize";
import { checkDigit, expectedCheckDigit, isNorthAmerican, makesMatch, manufacturerFromWmi, modelYearsForCode } from "../vin";
import type {
  CaseDocument,
  EvidenceRef,
  ExtractedField,
  Finding,
  FieldName,
  Odometer,
  RegistryCheck,
  Status,
  Vehicle,
} from "../types";

export const RULES_VERSION = "2026.10.3";

export interface RuleInput {
  vehicle: Vehicle;
  documents: CaseDocument[];
  /** Date the review is anchored to (case creation). Used for "future date" and report-age checks. */
  referenceDate: string;
  /** Results of external VIN / registry lookups already performed for this case. */
  registryChecks?: RegistryCheck[];
}

export interface RuleOptions {
  batteryReportMaxAgeDays: number;
}

// ---------------------------------------------------------------------------
// helpers

export function docTypeOf(doc: CaseDocument) {
  const f = doc.extraction?.fields.documentType;
  return f && f.value && f.supported ? f.value : null;
}

export function docLabel(doc: CaseDocument, t: RuleText = EN): string {
  return t.docLabel(docTypeOf(doc), doc.filename);
}

function field(doc: CaseDocument, name: FieldName): ExtractedField<unknown> | undefined {
  return doc.extraction?.fields[name];
}

function display(value: unknown, t: RuleText): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object" && value && "reading" in value) return t.odo(value as Odometer);
  return String(value);
}

export function ref(doc: CaseDocument, name: FieldName, note?: string, t: RuleText = EN): EvidenceRef {
  const f = field(doc, name);
  return {
    documentId: doc.id,
    documentName: docLabel(doc, t),
    field: t.field(name),
    value: display(f?.value, t),
    page: f?.page ?? null,
    quote: f?.quote ?? null,
    confidence: f?.confidence ?? null,
    note,
  };
}

function caseRef(fieldName: string, value: string, t: RuleText): EvidenceRef {
  return {
    documentId: null,
    documentName: t.ev.caseRecord,
    field: fieldName,
    value,
    page: null,
    quote: null,
    confidence: null,
  };
}

/** Returns the value if extracted and supported; otherwise null. */
export function usable(doc: CaseDocument, name: FieldName) {
  const f = field(doc, name);
  if (!f || f.value === null || f.value === undefined) return { state: "absent" as const };
  if (!f.supported) return { state: "excluded" as const, reason: f.unsupportedReason ?? EN.ev.unsupported };
  return { state: "ok" as const, value: f.value };
}

/** "Not used: …", with the reason in the reader's language where it is one VoltProof wrote. */
export function notUsed(reason: string, t: RuleText = EN) {
  return t.ev.notUsed(t.reason(reason));
}

export function readDocs(docs: CaseDocument[]) {
  return docs.filter((d) => d.extractionStatus === "extracted" && d.extraction);
}

export function isBatteryReport(doc: CaseDocument) {
  const t = docTypeOf(doc);
  return t === "battery_report" || t === "obd_screenshot";
}

// ---------------------------------------------------------------------------
// Rule 1 — VIN consistency, across every document that shows a VIN (battery
// reports included; rule 5 also checks them, because a report for another
// vehicle says nothing about this one's battery)

export function vinConsistency(input: RuleInput, t: RuleText = EN): Finding {
  const s = t.vinConsistency;
  const evidence: EvidenceRef[] = [];
  const caseVin = input.vehicle.vin ? normalizeVin(input.vehicle.vin) : "";
  if (caseVin) evidence.push(caseRef(t.ev.vin, caseVin, t));

  const vins: { vin: string; doc: CaseDocument }[] = [];
  for (const doc of readDocs(input.documents)) {
    const u = usable(doc, "vin");
    if (u.state === "ok") {
      vins.push({ vin: normalizeVin(String(u.value)), doc });
      evidence.push(ref(doc, "vin", undefined, t));
    } else if (u.state === "excluded") {
      evidence.push(ref(doc, "vin", notUsed(u.reason, t), t));
    }
  }

  const base = {
    id: "vin-consistency",
    ruleId: "vin_consistency",
    category: "vehicle_identity" as const,
    title: s.title,
    checked: s.checked,
    evidence,
    whyItMatters: s.why,
  };

  const reference = caseVin || vins[0]?.vin;
  if (!reference || vins.length === 0) {
    return { ...base, status: "unknown", result: s.none, nextAction: s.noneNext, decisionImpact: true, requiresReview: true };
  }
  const mismatches = vins.filter((v) => v.vin !== reference);
  const malformed = vins.filter((v) => !isWellFormedVin(v.vin));
  if (mismatches.length) {
    return {
      ...base,
      status: "conflict",
      result: s.conflict(
        mismatches.map((m) => s.mismatch(docLabel(m.doc, t), vinTail(m.vin))),
        caseVin ? "case" : "document",
        vinTail(reference),
      ),
      nextAction: s.conflictNext,
      decisionImpact: true,
      requiresReview: true,
    };
  }
  const malformedNote = malformed.length ? s.malformedNote(malformed.length) : "";
  if (vins.length === 1 && !caseVin) {
    return { ...base, status: "unknown", result: s.single(docLabel(vins[0].doc, t)) + malformedNote, nextAction: s.singleNext, decisionImpact: true, requiresReview: false };
  }
  return {
    ...base,
    status: "consistent",
    result: s.consistent(vins.length, !!caseVin, vinTail(reference)) + malformedNote,
    nextAction: null,
    decisionImpact: false,
    requiresReview: false,
  };
}

// ---------------------------------------------------------------------------
// Rule 2 — make and model consistency

export function vehicleConsistency(input: RuleInput, t: RuleText = EN): Finding {
  const s = t.vehicle;
  const evidence: EvidenceRef[] = [];
  const { make: caseMake, model: caseModel } = input.vehicle;
  if (caseMake || caseModel) evidence.push(caseRef(t.ev.makeModel, `${caseMake} ${caseModel}`.trim(), t));

  const problems: string[] = [];
  const notes: string[] = [];
  let compared = 0;
  for (const doc of readDocs(input.documents)) {
    const mk = usable(doc, "make");
    const md = usable(doc, "model");
    if (mk.state === "absent" && md.state === "absent") continue;
    if (mk.state === "excluded") evidence.push(ref(doc, "make", notUsed(mk.reason, t), t));
    if (md.state === "excluded") evidence.push(ref(doc, "model", notUsed(md.reason, t), t));
    if (mk.state === "ok") {
      evidence.push(ref(doc, "make", undefined, t));
      compared++;
      if (caseMake && normalizeMake(String(mk.value)) !== normalizeMake(caseMake)) {
        problems.push(s.makeProblem(docLabel(doc, t), String(mk.value), caseMake));
      }
    }
    if (md.state === "ok") {
      evidence.push(ref(doc, "model", undefined, t));
      compared++;
      if (caseModel) {
        const m = modelsMatch(String(md.value), caseModel);
        if (m === "different") problems.push(s.modelProblem(docLabel(doc, t), String(md.value), caseModel));
        if (m === "trim_variant") notes.push(s.trimNote(String(md.value), caseModel));
      }
    }
  }

  const base = {
    id: "vehicle-consistency",
    ruleId: "vehicle_consistency",
    category: "vehicle_identity" as const,
    title: s.title,
    checked: s.checked,
    evidence,
    whyItMatters: s.why,
  };

  if (problems.length) {
    return { ...base, status: "conflict", result: s.conflict(problems), nextAction: s.conflictNext, decisionImpact: true, requiresReview: true };
  }
  if (compared === 0) {
    return { ...base, status: "unknown", result: s.none, nextAction: s.noneNext, decisionImpact: false, requiresReview: false };
  }
  return {
    ...base,
    status: "consistent",
    result: s.consistent(notes),
    nextAction: null,
    decisionImpact: false,
    requiresReview: false,
  };
}

// ---------------------------------------------------------------------------
// Rule 3 — mileage timeline

interface Reading {
  doc: CaseDocument;
  date: Date;
  iso: string;
  km: number;
  odo: Odometer;
}

/** The date a reading was taken: the battery test date for battery reports, otherwise the document date. */
export function readingDate(doc: CaseDocument) {
  if (isBatteryReport(doc)) {
    const t = usable(doc, "batteryTestDate");
    if (t.state === "ok") return { name: "batteryTestDate" as const, value: String(t.value) };
  }
  const d = usable(doc, "documentDate");
  if (d.state === "ok") return { name: "documentDate" as const, value: String(d.value) };
  return null;
}

export function mileageTimeline(input: RuleInput, t: RuleText = EN): Finding {
  const s = t.mileage;
  const evidence: EvidenceRef[] = [];
  const readings: Reading[] = [];

  for (const doc of readDocs(input.documents)) {
    const o = usable(doc, "odometer");
    if (o.state === "absent") continue;
    if (o.state === "excluded") {
      evidence.push(ref(doc, "odometer", notUsed(o.reason, t), t));
      continue;
    }
    const odo = o.value as Odometer;
    const rd = readingDate(doc);
    const parsed = rd ? parseIsoDate(rd.value) : null;
    if (!rd || !parsed || !parsed.ok) {
      evidence.push(ref(doc, "odometer", t.ev.noTimelineDate, t));
      continue;
    }
    readings.push({ doc, date: parsed.date, iso: parsed.iso, km: toKm(odo), odo });
    evidence.push(ref(doc, "odometer", odo.unit === "mi" ? t.ev.datedMiles(parsed.iso, toKm(odo)) : t.ev.dated(parsed.iso), t));
  }

  readings.sort((a, b) => a.date.getTime() - b.date.getTime());

  const base = {
    id: "mileage-timeline",
    ruleId: "mileage_timeline",
    category: "odometer" as const,
    title: s.title,
    checked: s.checked,
    evidence,
    whyItMatters: s.why,
  };

  if (readings.length < 2) {
    return {
      ...base,
      status: "unknown",
      result: readings.length === 1 ? s.one : s.none,
      nextAction: s.noneNext,
      decisionImpact: true,
      requiresReview: false,
    };
  }

  const drops: string[] = [];
  let peak = readings[0];
  for (const r of readings.slice(1)) {
    const sameDay = r.iso === peak.iso;
    // Allow for rounding when converting between units.
    const tolerance = r.odo.unit !== peak.odo.unit ? 2 : 0.5;
    if (!sameDay && r.km < peak.km - tolerance) {
      drops.push(s.drop({ from: t.odo(peak.odo), fromDate: peak.iso, fromDoc: docLabel(peak.doc, t), to: t.odo(r.odo), toDate: r.iso, toDoc: docLabel(r.doc, t), dropKm: peak.km - r.km }));
    }
    if (r.km > peak.km) peak = r;
  }

  if (drops.length) {
    return {
      ...base,
      status: "conflict",
      result: s.conflict(drops),
      nextAction: s.conflictNext,
      decisionImpact: true,
      requiresReview: true,
    };
  }
  return {
    ...base,
    status: "consistent",
    result: s.consistent(readings.length, readings[0].iso, readings[readings.length - 1].iso),
    nextAction: null,
    decisionImpact: false,
    requiresReview: false,
  };
}

// ---------------------------------------------------------------------------
// Rule 4 — date consistency

export function dateConsistency(input: RuleInput, t: RuleText = EN): Finding {
  const s = t.dates;
  const evidence: EvidenceRef[] = [];
  const problems: string[] = [];
  const missing: string[] = [];
  const ref0 = parseIsoDate(input.referenceDate.slice(0, 10));
  const reference = ref0.ok ? ref0.date : new Date();
  const year = input.vehicle.year;
  // Vehicles can be registered or serviced from the year before the model year.
  const earliest = year ? new Date(Date.UTC(year - 1, 0, 1)) : null;
  let valid = 0;

  for (const doc of readDocs(input.documents)) {
    const names: FieldName[] = isBatteryReport(doc) ? ["documentDate", "batteryTestDate"] : ["documentDate"];
    let any = false;
    for (const name of names) {
      const u = usable(doc, name);
      if (u.state === "absent") continue;
      any = true;
      if (u.state === "excluded") {
        evidence.push(ref(doc, name, notUsed(u.reason, t), t));
        continue;
      }
      const p = parseIsoDate(String(u.value));
      if (!p.ok) {
        problems.push(s.invalid(docLabel(doc, t), name, p.code, p.value));
        evidence.push(ref(doc, name, t.ev.invalidDate, t));
        continue;
      }
      if (p.date.getTime() > reference.getTime()) {
        problems.push(s.future(docLabel(doc, t), p.iso, input.referenceDate.slice(0, 10)));
        evidence.push(ref(doc, name, t.ev.futureDate, t));
        continue;
      }
      if (earliest && p.date.getTime() < earliest.getTime()) {
        problems.push(s.beforeModelYear(docLabel(doc, t), p.iso, year!));
        evidence.push(ref(doc, name, t.ev.beforeModelYear, t));
        continue;
      }
      valid++;
      evidence.push(ref(doc, name, undefined, t));
    }
    if (!any) missing.push(docLabel(doc, t));
  }

  const base = {
    id: "date-consistency",
    ruleId: "date_consistency",
    category: "dates" as const,
    title: s.title,
    checked: s.checked,
    evidence,
    whyItMatters: s.why,
  };
  const missingNote = missing.length ? s.missingNote(missing) : "";

  if (problems.length) {
    return { ...base, status: "conflict", result: s.conflict(problems) + missingNote, nextAction: s.conflictNext, decisionImpact: true, requiresReview: true };
  }
  if (valid === 0) {
    return { ...base, status: "unknown", result: s.none + missingNote, nextAction: s.noneNext, decisionImpact: false, requiresReview: false };
  }
  return {
    ...base,
    status: "consistent",
    result: s.consistent(valid) + missingNote,
    nextAction: missing.length ? s.undatedNext : null,
    decisionImpact: false,
    requiresReview: false,
  };
}

// ---------------------------------------------------------------------------
// Rule 5 — battery report identifies the same vehicle

export function batteryReportVin(input: RuleInput, t: RuleText = EN): Finding {
  const s = t.batteryVin;
  const evidence: EvidenceRef[] = [];
  const caseVin = input.vehicle.vin ? normalizeVin(input.vehicle.vin) : "";
  if (caseVin) evidence.push(caseRef(t.ev.vin, caseVin, t));
  const reports = readDocs(input.documents).filter(isBatteryReport);

  const base = {
    id: "battery-report-vin",
    ruleId: "battery_report_vin",
    category: "battery" as const,
    title: s.title,
    checked: s.checked,
    evidence,
    whyItMatters: s.why,
  };

  if (!reports.length) {
    return { ...base, status: "unknown", result: t.noBatteryReport, nextAction: t.arrangeTest, decisionImpact: false, requiresReview: false };
  }
  const mismatches: string[] = [];
  let matched = 0;
  let unreadable = 0;
  for (const doc of reports) {
    const u = usable(doc, "vin");
    if (u.state === "ok") {
      evidence.push(ref(doc, "vin", undefined, t));
      const v = normalizeVin(String(u.value));
      if (caseVin && v !== caseVin) mismatches.push(s.mismatch(docLabel(doc, t), vinTail(v), vinTail(caseVin)));
      else if (caseVin) matched++;
    } else {
      unreadable++;
      if (u.state === "excluded") evidence.push(ref(doc, "vin", notUsed(u.reason, t), t));
    }
  }
  if (mismatches.length) {
    return { ...base, status: "conflict", result: s.conflict(mismatches), nextAction: s.conflictNext, decisionImpact: true, requiresReview: true };
  }
  if (!caseVin) {
    return { ...base, status: "unknown", result: s.noCaseVin, nextAction: s.noCaseVinNext, decisionImpact: true, requiresReview: false };
  }
  if (matched === 0) {
    return { ...base, status: "unknown", result: s.unreadable, nextAction: s.unreadableNext, decisionImpact: true, requiresReview: true };
  }
  return {
    ...base,
    status: "consistent",
    result: s.consistent(vinTail(caseVin), unreadable),
    nextAction: null,
    decisionImpact: false,
    requiresReview: false,
  };
}

// ---------------------------------------------------------------------------
// Rule 6 — battery report age

export function batteryReportAge(input: RuleInput, opts: RuleOptions, t: RuleText = EN): Finding {
  const s = t.batteryAge;
  const evidence: EvidenceRef[] = [];
  const reports = readDocs(input.documents).filter(isBatteryReport);
  const refParsed = parseIsoDate(input.referenceDate.slice(0, 10));
  const reference = refParsed.ok ? refParsed.date : new Date();
  const max = opts.batteryReportMaxAgeDays;

  const base = {
    id: "battery-report-age",
    ruleId: "battery_report_age",
    category: "battery" as const,
    title: s.title,
    checked: s.checked(max, input.referenceDate.slice(0, 10)),
    evidence,
    whyItMatters: s.why,
  };

  if (!reports.length) {
    return { ...base, status: "unknown", result: t.noBatteryReport, nextAction: t.arrangeTest, decisionImpact: false, requiresReview: false };
  }
  let newest: { days: number; iso: string } | null = null;
  for (const doc of reports) {
    const name = usable(doc, "batteryTestDate").state === "ok" ? "batteryTestDate" : "documentDate";
    const u = usable(doc, name);
    if (u.state !== "ok") {
      if (u.state === "excluded") evidence.push(ref(doc, name, notUsed(u.reason, t), t));
      continue;
    }
    const p = parseIsoDate(String(u.value));
    if (!p.ok) {
      evidence.push(ref(doc, name, t.ev.invalidDate, t));
      continue;
    }
    const days = daysBetween(p.date, reference);
    evidence.push(ref(doc, name, t.ev.daysBefore(days), t));
    if (!newest || days < newest.days) newest = { days, iso: p.iso };
  }
  if (!newest) {
    return { ...base, status: "unknown", result: s.noDate, nextAction: s.noDateNext, decisionImpact: true, requiresReview: true };
  }
  if (newest.days > max) {
    return { ...base, status: "conflict", result: s.conflict(newest.iso, newest.days, max), nextAction: s.conflictNext, decisionImpact: true, requiresReview: true };
  }
  return {
    ...base,
    status: "consistent",
    result: s.consistent(newest.iso, newest.days, max),
    nextAction: null,
    decisionImpact: false,
    requiresReview: false,
  };
}


// ---------------------------------------------------------------------------
// Rule 7 — VIN structure (offline) and reference decode (online, if performed)

export function vinStructure(input: RuleInput, t: RuleText = EN): Finding {
  const s = t.vinStructure;
  const evidence: EvidenceRef[] = [];
  const problems: string[] = [];
  const notes: string[] = [];
  const caseVin = input.vehicle.vin ? normalizeVin(input.vehicle.vin) : "";
  const vins: { vin: string; where: string; doc: CaseDocument | null }[] = [];
  if (caseVin) {
    vins.push({ vin: caseVin, where: s.caseRecord, doc: null });
    evidence.push(caseRef(t.ev.vin, caseVin, t));
  }
  let documentVins = 0;
  for (const doc of readDocs(input.documents)) {
    const u = usable(doc, "vin");
    if (u.state !== "ok") continue;
    documentVins++;
    const v = normalizeVin(String(u.value));
    if (vins.some((x) => x.vin === v)) continue;
    vins.push({ vin: v, where: docLabel(doc, t), doc });
    evidence.push(ref(doc, "vin", undefined, t));
  }

  const base = {
    id: "vin-structure",
    ruleId: "vin_structure",
    category: "vehicle_identity" as const,
    title: s.title,
    checked: s.checked,
    evidence,
    whyItMatters: s.why,
  };
  if (!vins.length) {
    return { ...base, status: "unknown", result: s.none, nextAction: s.noneNext, decisionImpact: false, requiresReview: false };
  }

  for (const { vin, where } of vins) {
    if (!isWellFormedVin(vin)) {
      problems.push(s.malformed(where, vin));
      continue;
    }
    const cd = checkDigit(vin);
    if (cd === "invalid") {
      const msg = s.checkDigit(where, vinTail(vin), vin[8], expectedCheckDigit(vin));
      if (isNorthAmerican(vin)) problems.push(msg);
      else notes.push(s.checkDigitNote(msg));
    }
    const maker = manufacturerFromWmi(vin);
    if (maker && input.vehicle.make && !makesMatch(maker, input.vehicle.make)) {
      problems.push(s.maker(where, vin.slice(0, 3), maker, input.vehicle.make));
    }
    const years = modelYearsForCode(vin[9]);
    const year = input.vehicle.year;
    if (year && years.length && !years.some((y) => Math.abs(y - year) <= 1)) {
      problems.push(s.modelYear(where, vin[9], years.filter((y) => y <= new Date().getFullYear() + 1).pop(), year));
    }
  }

  // Reference decode, if one was performed.
  const decode = [...(input.registryChecks ?? [])].reverse().find((r) => r.kind === "vin_decode" && r.query.vin === caseVin);
  if (decode) {
    evidence.push({
      documentId: null,
      documentName: decode.providerName,
      field: t.ev.vinDecode,
      value: decode.outcome === "ok" ? [decode.data.make, decode.data.model, decode.data.modelYear].filter(Boolean).join(" ") || t.ev.decoded : t.outcome(decode.outcome),
      page: null,
      quote: null,
      confidence: null,
      note: t.ev.lookedUp(decode.checkedAt.slice(0, 10), decode.checkedBy),
    });
    if (decode.outcome === "ok") {
      if (decode.data.make && input.vehicle.make && !makesMatch(decode.data.make, input.vehicle.make)) problems.push(s.decodeMake(decode.providerName, decode.data.make, input.vehicle.make));
      if (decode.data.modelYear && input.vehicle.year && Math.abs(Number(decode.data.modelYear) - input.vehicle.year) > 1) problems.push(s.decodeYear(decode.providerName, decode.data.modelYear, input.vehicle.year));
    }
  }

  // Government register match (NZ open data: VIN prefix only), if one was performed.
  const register = [...(input.registryChecks ?? [])].reverse().find((r) => r.kind === "register_match" && r.query.vin === caseVin);
  let registerVerified: string | null = null;
  if (register) {
    evidence.push({
      documentId: null,
      documentName: register.providerName,
      field: t.ev.registerRecords,
      value: register.outcome === "ok" ? t.ev.registerValue(register.data.matches, register.data.models) : t.registerOutcome(register.outcome),
      page: null,
      quote: null,
      confidence: null,
      note: t.ev.registerNote(register.message, register.checkedAt.slice(0, 10), register.checkedBy),
    });
    if (register.outcome === "ok") {
      const makes = (register.data.makes ?? "").split(", ").map((m) => m.replace(/ \(\d+\)$/, ""));
      const models = (register.data.models ?? "").split(", ").map((m) => m.replace(/ \(\d+\)$/, ""));
      const powers = register.data.motivePowers ?? "";
      const makeOk = !input.vehicle.make || makes.some((m) => makesMatch(m, input.vehicle.make));
      const modelOk = !input.vehicle.model || models.some((m) => modelsMatch(m, input.vehicle.model) !== "different");
      const electric = /ELECTRIC|PLUGIN|PLUG-IN/i.test(powers);
      if (!makeOk) problems.push(s.registerMake(register.providerName, register.data.vin11, register.data.makes, input.vehicle.make));
      else if (!modelOk) problems.push(s.registerModel(register.providerName, register.data.vin11, register.data.models, input.vehicle.model));
      else if (!electric) problems.push(s.registerPower(register.providerName, register.data.vin11, powers));
      else
        registerVerified = s.registerVerified({
          provider: register.providerName,
          matches: register.data.matches,
          prefix: register.data.vin11,
          years: register.data.years,
          make: register.data.make,
          model: register.data.model,
          power: register.data.motivePower,
        });
    }
  }

  if (problems.length) {
    return {
      ...base,
      status: "conflict",
      result: s.conflict(problems),
      nextAction: s.conflictNext,
      decisionImpact: true,
      requiresReview: true,
    };
  }
  const noteText = notes.length ? s.notes(notes) : "";
  if (decode?.outcome === "ok" || registerVerified) {
    const parts = [
      decode?.outcome === "ok" ? s.decodedAs(decode.providerName, [decode.data.modelYear, decode.data.make, decode.data.model].filter(Boolean).join(" "), decode.data.electrification) : null,
      registerVerified,
    ].filter((p): p is string => !!p);
    return {
      ...base,
      status: "verified",
      result: s.verified(parts) + noteText,
      nextAction: null,
      decisionImpact: false,
      requiresReview: false,
    };
  }
  const offline = s.offline(vins.length) + noteText;
  const registerNote = register && register.outcome !== "ok" ? s.serviceMessage(register.message) : "";
  if (decode) {
    // A lookup that failed or did not recognise the VIN confirms nothing, so it is not shown as Consistent.
    return {
      ...base,
      status: "unknown",
      result: offline + (decode.outcome === "not_found" ? s.decodeNotFound(decode.providerName, decode.message) : s.decodeIncomplete(decode.providerName, decode.message)) + registerNote,
      nextAction: decode.outcome === "not_found" ? s.notFoundNext : s.incompleteNext,
      decisionImpact: false,
      requiresReview: false,
    };
  }
  if (documentVins === 0) {
    // Only the VIN typed into the case: a valid format is not agreement between sources.
    return {
      ...base,
      status: "unknown",
      result: offline + s.caseOnly + registerNote,
      nextAction: s.caseOnlyNext,
      decisionImpact: false,
      requiresReview: false,
    };
  }
  return {
    ...base,
    status: "consistent",
    result: offline + s.noLookup + registerNote,
    nextAction: s.noLookupNext,
    decisionImpact: false,
    requiresReview: false,
  };
}


// ---------------------------------------------------------------------------
// Rule 8 — registration number consistency

export function registrationConsistency(input: RuleInput, t: RuleText = EN): Finding {
  const s = t.registration;
  const evidence: EvidenceRef[] = [];
  const plates: { plate: string; doc: CaseDocument }[] = [];
  for (const doc of readDocs(input.documents)) {
    const u = usable(doc, "registrationNumber");
    if (u.state === "absent") continue;
    evidence.push(ref(doc, "registrationNumber", u.state === "excluded" ? notUsed(u.reason, t) : undefined, t));
    if (u.state === "ok") plates.push({ plate: String(u.value).toUpperCase().replace(/[\s-]/g, ""), doc });
  }
  const base = {
    id: "registration-consistency",
    ruleId: "registration_consistency",
    category: "vehicle_identity" as const,
    title: s.title,
    checked: s.checked,
    evidence,
    whyItMatters: s.why,
  };
  if (!plates.length) return { ...base, status: "unknown", result: s.none, nextAction: null, decisionImpact: false, requiresReview: false };
  const distinct = Array.from(new Set(plates.map((p) => p.plate)));
  if (distinct.length > 1) {
    return { ...base, status: "conflict", result: s.conflict(plates.map((p) => s.plateOn(p.plate, docLabel(p.doc, t)))), nextAction: s.conflictNext, decisionImpact: true, requiresReview: true };
  }
  return {
    ...base,
    status: plates.length > 1 ? "consistent" : "unknown",
    result: plates.length > 1 ? s.consistent(plates.length, distinct[0]) : s.single(docLabel(plates[0].doc, t), distinct[0]),
    nextAction: null,
    decisionImpact: false,
    requiresReview: false,
  };
}

// ---------------------------------------------------------------------------
// Evidence summaries (derived from the rules above, not new checks)

export function batteryHealthEvidence(input: RuleInput, vinFinding: Finding, ageFinding: Finding, t: RuleText = EN): Finding {
  const s = t.batteryHealth;
  const reports = readDocs(input.documents).filter(isBatteryReport);
  const evidence: EvidenceRef[] = [];
  const reported: string[] = [];
  for (const doc of reports) {
    for (const name of ["batterySohPercent", "batteryTestProvider", "batteryTestDate"] as const) {
      const u = usable(doc, name);
      if (u.state !== "absent") evidence.push(ref(doc, name, u.state === "excluded" ? notUsed(u.reason, t) : undefined, t));
    }
    const soh = usable(doc, "batterySohPercent");
    const prov = usable(doc, "batteryTestProvider");
    if (soh.state === "ok") reported.push(s.reported(Number(soh.value), prov.state === "ok" ? String(prov.value) : null));
  }

  const base = {
    id: "battery-health",
    ruleId: "battery_health_evidence",
    category: "battery" as const,
    title: s.title,
    checked: s.checked,
    evidence,
    whyItMatters: s.why,
  };

  if (!reports.length) {
    return { ...base, status: "unknown", result: s.none, nextAction: s.noneNext, decisionImpact: true, requiresReview: true };
  }
  if (!reported.length) {
    return { ...base, status: "unknown", result: s.unreadable, nextAction: s.unreadableNext, decisionImpact: true, requiresReview: true };
  }
  if (vinFinding.status === "conflict" || ageFinding.status === "conflict") {
    return { ...base, status: "conflict", result: s.failed(reported, vinFinding.status === "conflict" ? "vin" : "age"), nextAction: t.arrangeTest, decisionImpact: true, requiresReview: true };
  }
  if (vinFinding.status !== "consistent") {
    return { ...base, status: "unknown", result: s.unlinked(reported), nextAction: s.unlinkedNext, decisionImpact: true, requiresReview: true };
  }
  return {
    ...base,
    status: "consistent",
    result: s.consistent(reported),
    nextAction: null,
    decisionImpact: false,
    requiresReview: false,
  };
}

export function currentOdometer(input: RuleInput, t: RuleText = EN): Finding {
  const s = t.currentOdometer;
  const evidence: EvidenceRef[] = [];
  const captured = readDocs(input.documents).filter((d) => d.provenance === "dealer_captured" && usable(d, "odometer").state === "ok");
  const base = {
    id: "current-odometer",
    ruleId: "current_odometer",
    category: "odometer" as const,
    title: s.title,
    checked: s.checked,
    evidence,
    whyItMatters: s.why,
  };
  if (!captured.length) {
    return { ...base, status: "unknown", result: s.none, nextAction: s.noneNext, decisionImpact: true, requiresReview: false };
  }
  const latest = captured
    .map((d) => ({ d, date: readingDate(d)?.value ?? "" }))
    .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  const o = usable(latest.d, "odometer");
  evidence.push(ref(latest.d, "odometer", t.ev.captured(latest.d.uploadedBy), t));
  return {
    ...base,
    status: "verified",
    result: s.verified(latest.date, t.odo(o.state === "ok" ? (o.value as Odometer) : { reading: 0, unit: "km" })),
    nextAction: null,
    decisionImpact: false,
    requiresReview: false,
  };
}

// ---------------------------------------------------------------------------
// Extraction quality, integrity and authenticity findings

const DECISION_FIELDS: FieldName[] = ["vin", "odometer", "documentDate", "batteryTestDate", "batterySohPercent"];

export function extractionFindings(input: RuleInput, t: RuleText = EN): Finding[] {
  const out: Finding[] = [];
  for (const doc of input.documents) {
    if (doc.extractionStatus === "failed" || doc.extractionStatus === "not_configured") {
      const s = t.notRead;
      out.push({
        id: `document-not-read:${doc.id}`,
        ruleId: "document_not_read",
        category: "extraction",
        title: s.title,
        checked: s.checked,
        evidence: [{ documentId: doc.id, documentName: doc.filename, field: t.ev.file, value: doc.filename, page: null, quote: null, confidence: null, note: doc.extractionError ?? undefined }],
        status: "unknown",
        result: doc.extractionStatus === "not_configured" ? s.notConfigured : s.failed(doc.extractionError),
        whyItMatters: s.why,
        nextAction: s.next,
        decisionImpact: false,
        requiresReview: true,
      });
      continue;
    }
    if (doc.extractionStatus !== "extracted" || !doc.extraction) continue;
    const weak = (Object.keys(doc.extraction.fields) as FieldName[]).filter((k) => {
      const f = doc.extraction!.fields[k];
      return f.value !== null && !f.supported;
    });
    if (!weak.length) continue;
    const s = t.unsupported;
    out.push({
      id: `extraction-unsupported:${doc.id}`,
      ruleId: "extraction_unsupported",
      category: "extraction",
      title: s.title,
      checked: s.checked,
      evidence: weak.map((k) => {
        const reason = doc.extraction!.fields[k].unsupportedReason;
        return ref(doc, k, reason === undefined ? undefined : t.reason(reason), t);
      }),
      status: "unknown",
      result: s.result(weak.length, docLabel(doc, t), weak.map((k) => t.field(k))),
      whyItMatters: s.why,
      nextAction: s.next,
      decisionImpact: weak.some((k) => DECISION_FIELDS.includes(k)),
      requiresReview: true,
    });
  }
  return out;
}

/** Why a document should not be relied on for verification, if anything. */
export function documentIntegrityIssue(doc: CaseDocument): DocumentIssue | null {
  const sig = doc.forensics?.signatures.find((x) => x.integrity === "invalid");
  if (sig) return "signature";
  const f = doc.forensics?.indicators.find((i) => i.severity === "potential");
  if (f) return "forensic";
  const i = doc.integrity.indicators.find((x) => x.severity === "potential");
  if (i) return "fileChecks";
  if ((doc.verifications ?? []).some((v) => v.outcome === "denied")) return "denied";
  return null;
}

export function integrityFindings(input: RuleInput, t: RuleText = EN): Finding[] {
  const s = t.integrity;
  const out: Finding[] = [];
  for (const doc of input.documents) {
    const fileLevel = doc.integrity.indicators.filter((i) => i.severity === "potential");
    const forensic = (doc.forensics?.indicators ?? []).filter((i) => i.severity === "potential");
    if (!fileLevel.length && !forensic.length) continue;
    const fields = Array.from(new Set(forensic.map((i) => i.field).filter((f): f is FieldName => !!f)));
    // The checks' own messages describe the file and quote it, so they are kept as written.
    const evidence: EvidenceRef[] = [
      ...forensic.map((i) =>
        i.field
          ? ref(doc, i.field, i.message, t)
          : { documentId: doc.id, documentName: docLabel(doc, t), field: t.ev.forensicCheck, value: i.code, page: i.page ?? null, quote: null, confidence: null, note: i.message },
      ),
      ...fileLevel.map((i) => ({ documentId: doc.id, documentName: docLabel(doc, t), field: t.ev.fileCheck, value: i.code, page: null, quote: null, confidence: null, note: i.message })),
    ];
    out.push({
      id: `integrity:${doc.id}`,
      ruleId: "integrity_indicators",
      category: "integrity",
      title: fields.length ? s.titleFields(fields) : s.title,
      checked: s.checked,
      evidence,
      // A check that ties a possible edit to a specific value failed, as does a broken signature: both are
      // Conflicts, like the claims resting on them. File-level hints alone (e.g. editing software) stay Unknown.
      status: fields.length || forensic.some((i) => i.code === "signature_broken") ? "conflict" : "unknown",
      result: (fields.length ? s.fields(fields.length, docLabel(doc, t)) : s.indicators(docLabel(doc, t))) + s.notProof,
      whyItMatters: s.why,
      nextAction: s.next,
      decisionImpact: true,
      requiresReview: true,
    });
  }
  return out;
}

export function signatureFindings(input: RuleInput, t: RuleText = EN): Finding[] {
  const s = t.signature;
  return input.documents
    .filter((d) => d.forensics?.signatures.length)
    .map((doc) => {
      const sigs = doc.forensics!.signatures;
      const broken = sigs.find((x) => x.integrity === "invalid");
      const good = sigs.find((x) => x.integrity === "valid");
      const evidence: EvidenceRef[] = sigs.map((x) => ({
        documentId: doc.id,
        documentName: docLabel(doc, t),
        field: t.ev.signature,
        value: x.signer ? `${x.signer}${x.organization && x.organization !== x.signer ? ` (${x.organization})` : ""}` : t.ev.unknownSigner,
        page: null,
        quote: null,
        confidence: null,
        note: x.detail,
      }));
      const base = {
        id: `signature:${doc.id}`,
        ruleId: "pdf_signature",
        category: "authenticity" as const,
        title: s.title(doc.filename),
        checked: s.checked,
        evidence,
        whyItMatters: s.why,
      };
      if (broken) {
        return { ...base, status: "conflict" as Status, result: s.broken(broken.signer), nextAction: s.brokenNext, decisionImpact: true, requiresReview: true };
      }
      if (good && good.trustedAs && good.coversWholeFile) {
        return { ...base, status: "verified" as Status, result: s.verified(good.trustedAs, good.signedAt ? good.signedAt.slice(0, 10) : null), nextAction: null, decisionImpact: false, requiresReview: false };
      }
      if (good) {
        return {
          ...base,
          status: "consistent" as Status,
          result: s.unconfirmed(good.signer, good.coversWholeFile ? "untrusted" : "added"),
          nextAction: good.coversWholeFile ? s.untrustedNext : s.addedNext,
          decisionImpact: false,
          requiresReview: false,
        };
      }
      return { ...base, status: "unknown" as Status, result: sigs[0].detail || s.unchecked, nextAction: s.uncheckedNext, decisionImpact: false, requiresReview: false };
    });
}

export function authenticityFinding(input: RuleInput, t: RuleText = EN): Finding {
  const s = t.authenticity;
  const confirmedBy = new Map<string, string>();
  const denied: string[] = [];
  for (const d of input.documents) {
    const sig = d.forensics?.signatures.find((x) => x.integrity === "valid" && x.trustedAs && x.coversWholeFile);
    if (sig) confirmedBy.set(d.id, s.bySignature(sig.trustedAs!));
    const v = [...(d.verifications ?? [])].reverse()[0];
    if (v?.outcome === "confirmed" && !confirmedBy.has(d.id)) confirmedBy.set(d.id, s.byIssuer(v.by, t.verificationMethod(v.method), v.reference));
    if (v?.outcome === "denied") denied.push(docLabel(d, t));
  }
  const evidence: EvidenceRef[] = input.documents.map((d) => ({
    documentId: d.id,
    documentName: docLabel(d, t),
    field: t.ev.issuerVerification,
    value: confirmedBy.get(d.id) ?? ((d.verifications ?? []).some((v) => v.outcome === "denied") ? t.ev.issuerDenied : t.ev.notPerformed),
    page: null,
    quote: null,
    confidence: null,
  }));
  const base = {
    id: "authenticity",
    ruleId: "authenticity_not_verified",
    category: "authenticity" as const,
    title: s.title,
    checked: s.checked,
    evidence,
    whyItMatters: s.why,
  };
  if (denied.length) {
    return { ...base, title: s.deniedTitle, status: "conflict", result: s.denied(denied), nextAction: s.deniedNext, decisionImpact: true, requiresReview: true };
  }
  if (input.documents.length && confirmedBy.size === input.documents.length) {
    return { ...base, title: s.confirmedTitle, status: "verified", result: s.confirmed([...confirmedBy.values()]), nextAction: null, decisionImpact: false, requiresReview: false };
  }
  return {
    ...base,
    status: "unknown",
    result: (confirmedBy.size ? s.some(confirmedBy.size, input.documents.length, [...confirmedBy.values()]) : s.noneConfirmed) + s.notProof,
    nextAction: s.next,
    decisionImpact: false,
    requiresReview: false,
  };
}

// ---------------------------------------------------------------------------

/**
 * Titles of the cross-document rule checks every case gets, in order (the
 * per-document extraction, forensic and signature findings come on top).
 * Derived from the rules themselves so documentation cannot drift from them.
 */
export function ruleCheckTitles(t: RuleText = EN): string[] {
  const empty: RuleInput = { vehicle: { make: "", model: "", year: null, vin: "" }, documents: [], referenceDate: "2000-01-01" };
  return runRules(empty, { batteryReportMaxAgeDays: 90 }, t)
    .filter((f) => f.category !== "authenticity")
    .map((f) => f.title);
}

export function runRules(input: RuleInput, opts: RuleOptions, t: RuleText = EN): Finding[] {
  const vin = vinConsistency(input, t);
  const vehicle = vehicleConsistency(input, t);
  const mileage = mileageTimeline(input, t);
  const dates = dateConsistency(input, t);
  const bVin = batteryReportVin(input, t);
  const bAge = batteryReportAge(input, opts, t);
  return [
    vin,
    vinStructure(input, t),
    registrationConsistency(input, t),
    vehicle,
    mileage,
    currentOdometer(input, t),
    dates,
    batteryHealthEvidence(input, bVin, bAge, t),
    bVin,
    bAge,
    ...extractionFindings(input, t),
    ...integrityFindings(input, t),
    ...signatureFindings(input, t),
    authenticityFinding(input, t),
  ];
}
