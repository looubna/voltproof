// Deterministic validation rules. The LLM never sets a status: every status
// below is computed from extracted, cited fields by ordinary code.
//
// Safety conventions:
// - A missing value is never treated as a conflict; it leads to "unknown".
// - Fields marked unsupported (no quote or low confidence) are excluded from
//   the checks and listed as excluded evidence, so a misread cannot create or
//   hide a conflict silently.

import { DOC_TYPE_LABEL, FIELD_LABEL, fieldLabelInline, joinList } from "../labels";
import {
  daysBetween,
  formatOdometer,
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

export function docLabel(doc: CaseDocument): string {
  const t = docTypeOf(doc);
  return t ? `${DOC_TYPE_LABEL[t]} · ${doc.filename}` : doc.filename;
}

function field(doc: CaseDocument, name: FieldName): ExtractedField<unknown> | undefined {
  return doc.extraction?.fields[name];
}

function display(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object" && value && "reading" in value) return formatOdometer(value as Odometer);
  return String(value);
}

export function ref(doc: CaseDocument, name: FieldName, note?: string): EvidenceRef {
  const f = field(doc, name);
  return {
    documentId: doc.id,
    documentName: docLabel(doc),
    field: FIELD_LABEL[name] ?? name,
    value: display(f?.value),
    page: f?.page ?? null,
    quote: f?.quote ?? null,
    confidence: f?.confidence ?? null,
    note,
  };
}

function caseRef(fieldName: string, value: string): EvidenceRef {
  return {
    documentId: null,
    documentName: "Case record (entered by appraiser)",
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
  if (!f.supported) return { state: "excluded" as const, reason: f.unsupportedReason ?? "not supported by a quote" };
  return { state: "ok" as const, value: f.value };
}

export function readDocs(docs: CaseDocument[]) {
  return docs.filter((d) => d.extractionStatus === "extracted" && d.extraction);
}

export function isBatteryReport(doc: CaseDocument) {
  const t = docTypeOf(doc);
  return t === "battery_report" || t === "obd_screenshot";
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

// ---------------------------------------------------------------------------
// Rule 1 — VIN consistency, across every document that shows a VIN (battery
// reports included; rule 5 also checks them, because a report for another
// vehicle says nothing about this one's battery)

export function vinConsistency(input: RuleInput): Finding {
  const evidence: EvidenceRef[] = [];
  const caseVin = input.vehicle.vin ? normalizeVin(input.vehicle.vin) : "";
  if (caseVin) evidence.push(caseRef("VIN", caseVin));

  const vins: { vin: string; doc: CaseDocument }[] = [];
  for (const doc of readDocs(input.documents)) {
    const u = usable(doc, "vin");
    if (u.state === "ok") {
      vins.push({ vin: normalizeVin(String(u.value)), doc });
      evidence.push(ref(doc, "vin"));
    } else if (u.state === "excluded") {
      evidence.push(ref(doc, "vin", `Not used: ${u.reason}`));
    }
  }

  const base = {
    id: "vin-consistency",
    ruleId: "vin_consistency",
    category: "vehicle_identity" as const,
    title: "VIN consistency",
    checked: "Whether every document that shows a VIN identifies the same vehicle as the case record.",
    evidence,
    whyItMatters: "Documents for a different vehicle cannot support claims about this one. A mismatch can also come from a typing error or a mixed-up file.",
  };

  const reference = caseVin || vins[0]?.vin;
  if (!reference || vins.length === 0) {
    return { ...base, status: "unknown", result: "No document provides a readable VIN.", nextAction: "Photograph the VIN plate and upload the registration document.", decisionImpact: true, requiresReview: true };
  }
  const mismatches = vins.filter((v) => v.vin !== reference);
  const malformed = vins.filter((v) => !isWellFormedVin(v.vin));
  if (mismatches.length) {
    const desc = mismatches.map((m) => `${docLabel(m.doc)} shows a VIN ending ${vinTail(m.vin)}`).join("; ");
    return {
      ...base,
      status: "conflict",
      result: `${desc}, but the ${caseVin ? "case record" : "first document"} has a VIN ending ${vinTail(reference)}.`,
      nextAction: "Check the VIN on the vehicle itself and ask the seller to explain why the document shows a different VIN.",
      decisionImpact: true,
      requiresReview: true,
    };
  }
  const malformedNote = malformed.length ? ` Note: ${plural(malformed.length, "VIN")} does not have the standard 17-character format.` : "";
  if (vins.length === 1 && !caseVin) {
    return { ...base, status: "unknown", result: `Only one source (${docLabel(vins[0].doc)}) shows a VIN; nothing to compare.${malformedNote}`, nextAction: "Enter the VIN from the vehicle plate in the case record.", decisionImpact: true, requiresReview: false };
  }
  return {
    ...base,
    status: "consistent",
    result: `${plural(vins.length, "document")}${caseVin ? " and the case record" : ""} show the same VIN (ending ${vinTail(reference)}). This shows the documents agree; it does not prove they are genuine.${malformedNote}`,
    nextAction: null,
    decisionImpact: false,
    requiresReview: false,
  };
}

// ---------------------------------------------------------------------------
// Rule 2 — make and model consistency

export function vehicleConsistency(input: RuleInput): Finding {
  const evidence: EvidenceRef[] = [];
  const { make: caseMake, model: caseModel } = input.vehicle;
  if (caseMake || caseModel) evidence.push(caseRef("Make / model", `${caseMake} ${caseModel}`.trim()));

  const problems: string[] = [];
  const notes: string[] = [];
  let compared = 0;
  for (const doc of readDocs(input.documents)) {
    const mk = usable(doc, "make");
    const md = usable(doc, "model");
    if (mk.state === "absent" && md.state === "absent") continue;
    if (mk.state === "excluded") evidence.push(ref(doc, "make", `Not used: ${mk.reason}`));
    if (md.state === "excluded") evidence.push(ref(doc, "model", `Not used: ${md.reason}`));
    if (mk.state === "ok") {
      evidence.push(ref(doc, "make"));
      compared++;
      if (caseMake && normalizeMake(String(mk.value)) !== normalizeMake(caseMake)) {
        problems.push(`${docLabel(doc)} names the make as "${mk.value}", not "${caseMake}"`);
      }
    }
    if (md.state === "ok") {
      evidence.push(ref(doc, "model"));
      compared++;
      if (caseModel) {
        const m = modelsMatch(String(md.value), caseModel);
        if (m === "different") problems.push(`${docLabel(doc)} names the model as "${md.value}", not "${caseModel}"`);
        if (m === "trim_variant") notes.push(`"${md.value}" treated as a trim of "${caseModel}"`);
      }
    }
  }

  const base = {
    id: "vehicle-consistency",
    ruleId: "vehicle_consistency",
    category: "vehicle_identity" as const,
    title: "Make and model consistency",
    checked: "Whether the make and model on each document match the vehicle in the case record.",
    evidence,
    whyItMatters: "A different make or model suggests the document belongs to another vehicle or was filled in incorrectly.",
  };

  if (problems.length) {
    return { ...base, status: "conflict", result: problems.join("; ") + ".", nextAction: "Confirm the make and model on the vehicle and ask the seller to explain the document.", decisionImpact: true, requiresReview: true };
  }
  if (compared === 0) {
    return { ...base, status: "unknown", result: "No document states a readable make or model.", nextAction: "Upload the registration document.", decisionImpact: false, requiresReview: false };
  }
  return {
    ...base,
    status: "consistent",
    result: `Every stated make and model matches the case record.${notes.length ? " " + notes.join("; ") + "." : ""}`,
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

export function mileageTimeline(input: RuleInput): Finding {
  const evidence: EvidenceRef[] = [];
  const readings: Reading[] = [];

  for (const doc of readDocs(input.documents)) {
    const o = usable(doc, "odometer");
    if (o.state === "absent") continue;
    if (o.state === "excluded") {
      evidence.push(ref(doc, "odometer", `Not used: ${o.reason}`));
      continue;
    }
    const odo = o.value as Odometer;
    const rd = readingDate(doc);
    const parsed = rd ? parseIsoDate(rd.value) : null;
    if (!rd || !parsed || !parsed.ok) {
      evidence.push(ref(doc, "odometer", "Not placed on the timeline: the document has no usable date."));
      continue;
    }
    readings.push({ doc, date: parsed.date, iso: parsed.iso, km: toKm(odo), odo });
    evidence.push(ref(doc, "odometer", `Dated ${parsed.iso}${odo.unit === "mi" ? ` (≈ ${Math.round(toKm(odo)).toLocaleString("en-US")} km)` : ""}`));
  }

  readings.sort((a, b) => a.date.getTime() - b.date.getTime());

  const base = {
    id: "mileage-timeline",
    ruleId: "mileage_timeline",
    category: "odometer" as const,
    title: "Mileage timeline",
    checked: "Whether odometer readings increase over time, after converting miles to kilometres and ordering by document date.",
    evidence,
    whyItMatters: "A reading that goes down over time leaves the mileage history unresolved. Mileage strongly affects a used vehicle's value and condition.",
  };

  if (readings.length < 2) {
    return {
      ...base,
      status: "unknown",
      result: readings.length === 1 ? "Only one dated odometer reading is available, so a timeline cannot be checked." : "No dated odometer readings are available.",
      nextAction: "Ask the seller for dated service invoices that show the odometer.",
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
      drops.push(
        `${formatOdometer(peak.odo)} on ${peak.iso} (${docLabel(peak.doc)}) is followed by ${formatOdometer(r.odo)} on ${r.iso} (${docLabel(r.doc)}), a drop of about ${Math.round(peak.km - r.km).toLocaleString("en-US")} km`,
      );
    }
    if (r.km > peak.km) peak = r;
  }

  if (drops.length) {
    return {
      ...base,
      status: "conflict",
      result: `The odometer reading decreases over time: ${drops.join("; ")}. This needs investigation. It is not, by itself, proof of tampering. Possible explanations include an instrument-cluster replacement, a data-entry error on an invoice, or odometer rollback.`,
      nextAction: "Ask the seller to explain the readings and to provide any instrument-cluster repair or replacement records. Check the service history with the workshop that issued the invoice.",
      decisionImpact: true,
      requiresReview: true,
    };
  }
  return {
    ...base,
    status: "consistent",
    result: `${plural(readings.length, "dated reading")} from ${readings[0].iso} to ${readings[readings.length - 1].iso} increase over time. This shows the documents agree; it does not prove the readings are accurate.`,
    nextAction: null,
    decisionImpact: false,
    requiresReview: false,
  };
}

// ---------------------------------------------------------------------------
// Rule 4 — date consistency

export function dateConsistency(input: RuleInput): Finding {
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
        evidence.push(ref(doc, name, `Not used: ${u.reason}`));
        continue;
      }
      const p = parseIsoDate(String(u.value));
      if (!p.ok) {
        problems.push(`${docLabel(doc)}: ${fieldLabelInline(name)} ${p.reason}`);
        evidence.push(ref(doc, name, "Invalid date"));
        continue;
      }
      if (p.date.getTime() > reference.getTime()) {
        problems.push(`${docLabel(doc)} is dated ${p.iso}, after this review was opened (${input.referenceDate.slice(0, 10)})`);
        evidence.push(ref(doc, name, "Date is in the future"));
        continue;
      }
      if (earliest && p.date.getTime() < earliest.getTime()) {
        problems.push(`${docLabel(doc)} is dated ${p.iso}, before the vehicle's ${year} model year`);
        evidence.push(ref(doc, name, "Earlier than the model year"));
        continue;
      }
      valid++;
      evidence.push(ref(doc, name));
    }
    if (!any) missing.push(docLabel(doc));
  }

  const base = {
    id: "date-consistency",
    ruleId: "date_consistency",
    category: "dates" as const,
    title: "Document dates",
    checked: "Whether each document date is a real calendar date, is not later than the review date, and is not earlier than the vehicle's model year.",
    evidence,
    whyItMatters: "The mileage timeline and the battery report age depend on correct dates. An impossible or future date suggests an error or an altered document.",
  };
  const missingNote = missing.length ? ` No date found on: ${missing.join("; ")}.` : "";

  if (problems.length) {
    return { ...base, status: "conflict", result: problems.join("; ") + "." + missingNote, nextAction: "Check the dates on the original documents and ask the issuer or seller to confirm them.", decisionImpact: true, requiresReview: true };
  }
  if (valid === 0) {
    return { ...base, status: "unknown", result: "No usable document dates were found." + missingNote, nextAction: "Ask the seller for dated documents.", decisionImpact: false, requiresReview: false };
  }
  return {
    ...base,
    status: "consistent",
    result: `${plural(valid, "date")} checked; all are real dates within the expected range.` + missingNote,
    nextAction: missing.length ? "Ask for dated versions of the undated documents if they matter for the decision." : null,
    decisionImpact: false,
    requiresReview: false,
  };
}

// ---------------------------------------------------------------------------
// Rule 5 — battery report identifies the same vehicle

export function batteryReportVin(input: RuleInput): Finding {
  const evidence: EvidenceRef[] = [];
  const caseVin = input.vehicle.vin ? normalizeVin(input.vehicle.vin) : "";
  if (caseVin) evidence.push(caseRef("VIN", caseVin));
  const reports = readDocs(input.documents).filter(isBatteryReport);

  const base = {
    id: "battery-report-vin",
    ruleId: "battery_report_vin",
    category: "battery" as const,
    title: "Battery report VIN",
    checked: "Whether the battery report names the same VIN as the case record.",
    evidence,
    whyItMatters: "A battery report for another vehicle says nothing about this vehicle's battery.",
  };

  if (!reports.length) {
    return { ...base, status: "unknown", result: "No battery report was provided.", nextAction: "Arrange an independent battery test.", decisionImpact: false, requiresReview: false };
  }
  const mismatches: string[] = [];
  let matched = 0;
  let unreadable = 0;
  for (const doc of reports) {
    const u = usable(doc, "vin");
    if (u.state === "ok") {
      evidence.push(ref(doc, "vin"));
      const v = normalizeVin(String(u.value));
      if (caseVin && v !== caseVin) mismatches.push(`${docLabel(doc)} names a VIN ending ${vinTail(v)}; the case VIN ends ${vinTail(caseVin)}`);
      else if (caseVin) matched++;
    } else {
      unreadable++;
      if (u.state === "excluded") evidence.push(ref(doc, "vin", `Not used: ${u.reason}`));
    }
  }
  if (mismatches.length) {
    return { ...base, status: "conflict", result: mismatches.join("; ") + ".", nextAction: "Do not rely on this report. Ask the provider to confirm which vehicle was tested, or arrange a new independent test.", decisionImpact: true, requiresReview: true };
  }
  if (!caseVin) {
    return { ...base, status: "unknown", result: "The case record has no VIN to compare against.", nextAction: "Enter the VIN from the vehicle plate.", decisionImpact: true, requiresReview: false };
  }
  if (matched === 0) {
    return { ...base, status: "unknown", result: "The battery report does not show a readable VIN, so it cannot be linked to this vehicle.", nextAction: "Ask the test provider for a report that names the VIN.", decisionImpact: true, requiresReview: true };
  }
  return {
    ...base,
    status: "consistent",
    result: `The battery report names the case VIN (ending ${vinTail(caseVin)}).${unreadable ? ` ${plural(unreadable, "other report")} had no readable VIN.` : ""} This links the report to the vehicle on paper; it does not confirm the report with its issuer.`,
    nextAction: null,
    decisionImpact: false,
    requiresReview: false,
  };
}

// ---------------------------------------------------------------------------
// Rule 6 — battery report age

export function batteryReportAge(input: RuleInput, opts: RuleOptions): Finding {
  const evidence: EvidenceRef[] = [];
  const reports = readDocs(input.documents).filter(isBatteryReport);
  const refParsed = parseIsoDate(input.referenceDate.slice(0, 10));
  const reference = refParsed.ok ? refParsed.date : new Date();
  const max = opts.batteryReportMaxAgeDays;

  const base = {
    id: "battery-report-age",
    ruleId: "battery_report_age",
    category: "battery" as const,
    title: "Battery report age",
    checked: `Whether the battery test was performed within ${max} days of this review (${input.referenceDate.slice(0, 10)}).`,
    evidence,
    whyItMatters: "Battery condition changes with time and use. An old report may not describe the battery today.",
  };

  if (!reports.length) {
    return { ...base, status: "unknown", result: "No battery report was provided.", nextAction: "Arrange an independent battery test.", decisionImpact: false, requiresReview: false };
  }
  let newest: { days: number; iso: string } | null = null;
  for (const doc of reports) {
    const name = usable(doc, "batteryTestDate").state === "ok" ? "batteryTestDate" : "documentDate";
    const u = usable(doc, name);
    if (u.state !== "ok") {
      if (u.state === "excluded") evidence.push(ref(doc, name, `Not used: ${u.reason}`));
      continue;
    }
    const p = parseIsoDate(String(u.value));
    if (!p.ok) {
      evidence.push(ref(doc, name, "Invalid date"));
      continue;
    }
    const days = daysBetween(p.date, reference);
    evidence.push(ref(doc, name, `${days} days before the review date`));
    if (!newest || days < newest.days) newest = { days, iso: p.iso };
  }
  if (!newest) {
    return { ...base, status: "unknown", result: "The battery report has no usable test date.", nextAction: "Ask the provider for the test date, or arrange a new test.", decisionImpact: true, requiresReview: true };
  }
  if (newest.days > max) {
    return { ...base, status: "conflict", result: `The most recent battery test (${newest.iso}) was ${newest.days} days before this review, more than the ${max}-day limit.`, nextAction: "Arrange a new independent battery test.", decisionImpact: true, requiresReview: true };
  }
  return {
    ...base,
    status: "consistent",
    result: `The battery test date stated on the report (${newest.iso}) is ${newest.days} days before this review, within the ${max}-day limit. The date was read from the report, not confirmed with the provider.`,
    nextAction: null,
    decisionImpact: false,
    requiresReview: false,
  };
}


// ---------------------------------------------------------------------------
// Rule 7 — VIN structure (offline) and reference decode (online, if performed)

export function vinStructure(input: RuleInput): Finding {
  const evidence: EvidenceRef[] = [];
  const problems: string[] = [];
  const notes: string[] = [];
  const caseVin = input.vehicle.vin ? normalizeVin(input.vehicle.vin) : "";
  const vins: { vin: string; where: string; doc: CaseDocument | null }[] = [];
  if (caseVin) {
    vins.push({ vin: caseVin, where: "the case record", doc: null });
    evidence.push(caseRef("VIN", caseVin));
  }
  let documentVins = 0;
  for (const doc of readDocs(input.documents)) {
    const u = usable(doc, "vin");
    if (u.state !== "ok") continue;
    documentVins++;
    const v = normalizeVin(String(u.value));
    if (vins.some((x) => x.vin === v)) continue;
    vins.push({ vin: v, where: docLabel(doc), doc });
    evidence.push(ref(doc, "vin"));
  }

  const base = {
    id: "vin-structure",
    ruleId: "vin_structure",
    category: "vehicle_identity" as const,
    title: "VIN structure and decode",
    checked: "Whether each VIN is well-formed (17 characters, no I/O/Q), has a valid check digit where one is used, and encodes the same manufacturer and model year as the case record; and, if a reference decoder was consulted, what it returned.",
    evidence,
    whyItMatters: "A VIN that fails these checks was mistyped, misread or made up. A valid VIN is not proof the documents are genuine: forgers copy real VINs.",
  };
  if (!vins.length) {
    return { ...base, status: "unknown", result: "No VIN is available to check.", nextAction: "Enter the VIN from the vehicle plate.", decisionImpact: false, requiresReview: false };
  }

  for (const { vin, where } of vins) {
    if (!isWellFormedVin(vin)) {
      problems.push(`${where}: "${vin}" is not a well-formed 17-character VIN`);
      continue;
    }
    const cd = checkDigit(vin);
    if (cd === "invalid") {
      const msg = `${where}: VIN ending ${vinTail(vin)} fails its check digit (position 9 is "${vin[8]}", the VIN's other characters require "${expectedCheckDigit(vin)}")`;
      if (isNorthAmerican(vin)) problems.push(msg);
      else notes.push(`${msg}. Some manufacturers outside North America do not use a check digit, so this is noted rather than flagged`);
    }
    const maker = manufacturerFromWmi(vin);
    if (maker && input.vehicle.make && !makesMatch(maker, input.vehicle.make)) {
      problems.push(`${where}: VIN starting ${vin.slice(0, 3)} is assigned to ${maker}, not ${input.vehicle.make}`);
    }
    const years = modelYearsForCode(vin[9]);
    const year = input.vehicle.year;
    if (year && years.length && !years.some((y) => Math.abs(y - year) <= 1)) {
      problems.push(`${where}: position 10 ("${vin[9]}") encodes model year ${years.filter((y) => y <= new Date().getFullYear() + 1).pop()}, not ${year}`);
    }
  }

  // Reference decode, if one was performed.
  const decode = [...(input.registryChecks ?? [])].reverse().find((r) => r.kind === "vin_decode" && r.query.vin === caseVin);
  if (decode) {
    evidence.push({ documentId: null, documentName: decode.providerName, field: "VIN decode", value: decode.outcome === "ok" ? [decode.data.make, decode.data.model, decode.data.modelYear].filter(Boolean).join(" ") || "decoded" : decode.outcome, page: null, quote: null, confidence: null, note: `Looked up ${decode.checkedAt.slice(0, 10)} by ${decode.checkedBy}` });
    if (decode.outcome === "ok") {
      if (decode.data.make && input.vehicle.make && !makesMatch(decode.data.make, input.vehicle.make)) problems.push(`${decode.providerName} decodes the VIN as a ${decode.data.make}, not a ${input.vehicle.make}`);
      if (decode.data.modelYear && input.vehicle.year && Math.abs(Number(decode.data.modelYear) - input.vehicle.year) > 1) problems.push(`${decode.providerName} decodes model year ${decode.data.modelYear}, not ${input.vehicle.year}`);
    }
  }

  // Government register match (NZ open data: VIN prefix only), if one was performed.
  const register = [...(input.registryChecks ?? [])].reverse().find((r) => r.kind === "register_match" && r.query.vin === caseVin);
  let registerVerified: string | null = null;
  if (register) {
    evidence.push({ documentId: null, documentName: register.providerName, field: "Register records for VIN prefix", value: register.outcome === "ok" ? `${register.data.matches} × ${register.data.models}` : register.outcome.replace("_", " "), page: null, quote: null, confidence: null, note: `${register.message} Looked up ${register.checkedAt.slice(0, 10)} by ${register.checkedBy}` });
    if (register.outcome === "ok") {
      const makes = (register.data.makes ?? "").split(", ").map((m) => m.replace(/ \(\d+\)$/, ""));
      const models = (register.data.models ?? "").split(", ").map((m) => m.replace(/ \(\d+\)$/, ""));
      const powers = register.data.motivePowers ?? "";
      const makeOk = !input.vehicle.make || makes.some((m) => makesMatch(m, input.vehicle.make));
      const modelOk = !input.vehicle.model || models.some((m) => modelsMatch(m, input.vehicle.model) !== "different");
      const electric = /ELECTRIC|PLUGIN|PLUG-IN/i.test(powers);
      if (!makeOk) problems.push(`the ${register.providerName} records vehicles with VIN prefix ${register.data.vin11} as ${register.data.makes}, not ${input.vehicle.make}`);
      else if (!modelOk) problems.push(`the ${register.providerName} records VIN prefix ${register.data.vin11} as ${register.data.models}, not ${input.vehicle.model}`);
      else if (!electric) problems.push(`the ${register.providerName} records VIN prefix ${register.data.vin11} with motive power ${powers}, not electric`);
      else registerVerified = `${register.providerName} records ${register.data.matches} vehicle${register.data.matches === "1" ? "" : "s"} with VIN prefix ${register.data.vin11}, all consistent with a ${register.data.years ?? ""} ${register.data.make} ${register.data.model} (${register.data.motivePower?.toLowerCase()}). The register publishes only the first 11 VIN characters, so this confirms the make, model and power type the prefix belongs to, not this individual vehicle`.replace("  ", " ");
    }
  }

  if (problems.length) {
    return {
      ...base,
      status: "conflict",
      result: problems.join("; ") + ". This needs checking against the plate on the vehicle. It is not, by itself, proof of fraud: a single misread character causes it too.",
      nextAction: "Read the VIN from the vehicle plate and windscreen, and compare it character by character with the documents.",
      decisionImpact: true,
      requiresReview: true,
    };
  }
  const noteText = notes.length ? ` Note: ${notes.join("; ")}.` : "";
  if (decode?.outcome === "ok" || registerVerified) {
    const parts = [
      decode?.outcome === "ok" ? `${decode.providerName} decodes the VIN as ${[decode.data.modelYear, decode.data.make, decode.data.model].filter(Boolean).join(" ")}${decode.data.electrification ? ` (${decode.data.electrification})` : ""}, matching the case record` : null,
      registerVerified,
    ].filter(Boolean);
    return {
      ...base,
      status: "verified",
      result: `What was verified: ${parts.join(". ")}. Every VIN on file is well-formed. This does not confirm registration of this vehicle, its ownership or its history.${noteText}`,
      nextAction: null,
      decisionImpact: false,
      requiresReview: false,
    };
  }
  const offline = `${plural(vins.length, "VIN")} checked: the format is valid, and the maker and model-year codes match the case record.${noteText}`;
  const registerNote = register && register.outcome !== "ok" ? ` ${register.message}` : "";
  if (decode) {
    // A lookup that failed or did not recognise the VIN confirms nothing, so it is not shown as Consistent.
    return {
      ...base,
      status: "unknown",
      result:
        decode.outcome === "not_found"
          ? `${offline} The ${decode.providerName} could not identify this VIN: ${decode.message} Its coverage is best for vehicles sold in North America, so this is common for other markets, but the VIN is not confirmed by a reference source.${registerNote}`
          : `${offline} The ${decode.providerName} lookup did not complete: ${decode.message}${registerNote}`,
      nextAction: decode.outcome === "not_found" ? "Compare the VIN on the vehicle plate with the documents character by character, or check it with a registry for the vehicle's market." : "Run the VIN decode again.",
      decisionImpact: false,
      requiresReview: false,
    };
  }
  if (documentVins === 0) {
    // Only the VIN typed into the case: a valid format is not agreement between sources.
    return {
      ...base,
      status: "unknown",
      result: `${offline} No document shows a VIN and no VIN lookup has been run, so nothing confirms it yet.${registerNote}`,
      nextAction: "Upload the registration document, or look the VIN up.",
      decisionImpact: false,
      requiresReview: false,
    };
  }
  return {
    ...base,
    status: "consistent",
    result: `${offline} No VIN lookup has been run yet.${registerNote}`,
    nextAction: "Look the VIN up in a VIN database.",
    decisionImpact: false,
    requiresReview: false,
  };
}


// ---------------------------------------------------------------------------
// Rule 8 — registration number consistency

export function registrationConsistency(input: RuleInput): Finding {
  const evidence: EvidenceRef[] = [];
  const plates: { plate: string; doc: CaseDocument }[] = [];
  for (const doc of readDocs(input.documents)) {
    const u = usable(doc, "registrationNumber");
    if (u.state === "absent") continue;
    evidence.push(ref(doc, "registrationNumber", u.state === "excluded" ? `Not used: ${u.reason}` : undefined));
    if (u.state === "ok") plates.push({ plate: String(u.value).toUpperCase().replace(/[\s-]/g, ""), doc });
  }
  const base = {
    id: "registration-consistency",
    ruleId: "registration_consistency",
    category: "vehicle_identity" as const,
    title: "Registration number",
    checked: "Whether every document that shows a registration (plate) number shows the same one.",
    evidence,
    whyItMatters: "Registries are searched by plate as well as VIN. A different plate on one document suggests it belongs to another vehicle or was changed.",
  };
  if (!plates.length) return { ...base, status: "unknown", result: "No document shows a readable registration number.", nextAction: null, decisionImpact: false, requiresReview: false };
  const distinct = Array.from(new Set(plates.map((p) => p.plate)));
  if (distinct.length > 1) {
    return { ...base, status: "conflict", result: `Documents show different registration numbers: ${plates.map((p) => `${p.plate} on ${docLabel(p.doc)}`).join("; ")}.`, nextAction: "Check the plate on the vehicle and ask the seller to explain the different number.", decisionImpact: true, requiresReview: true };
  }
  return {
    ...base,
    status: plates.length > 1 ? "consistent" : "unknown",
    result: plates.length > 1 ? `${plural(plates.length, "document")} show the same registration number (${distinct[0]}). This shows the documents agree; it does not confirm the registration.` : `Only ${docLabel(plates[0].doc)} shows a registration number (${distinct[0]}); nothing to compare it with.`,
    nextAction: null,
    decisionImpact: false,
    requiresReview: false,
  };
}

// ---------------------------------------------------------------------------
// Evidence summaries (derived from the rules above, not new checks)

export function batteryHealthEvidence(input: RuleInput, vinFinding: Finding, ageFinding: Finding): Finding {
  const reports = readDocs(input.documents).filter(isBatteryReport);
  const evidence: EvidenceRef[] = [];
  const reported: string[] = [];
  for (const doc of reports) {
    for (const name of ["batterySohPercent", "batteryTestProvider", "batteryTestDate"] as const) {
      const u = usable(doc, name);
      if (u.state !== "absent") evidence.push(ref(doc, name, u.state === "excluded" ? `Not used: ${u.reason}` : undefined));
    }
    const soh = usable(doc, "batterySohPercent");
    const prov = usable(doc, "batteryTestProvider");
    if (soh.state === "ok") reported.push(`${soh.value}% state of health, as reported by ${prov.state === "ok" ? prov.value : "an unnamed provider"}`);
  }

  const base = {
    id: "battery-health",
    ruleId: "battery_health_evidence",
    category: "battery" as const,
    title: "Battery health evidence",
    checked: "Whether a battery test report for this vehicle is available, and what it reports.",
    evidence,
    whyItMatters: "Battery condition is a major part of a used EV's value and could affect the purchase decision.",
  };

  if (!reports.length) {
    return { ...base, status: "unknown", result: "Battery health is not established: no battery test report was provided.", nextAction: "Arrange an independent battery test before making an offer.", decisionImpact: true, requiresReview: true };
  }
  if (!reported.length) {
    return { ...base, status: "unknown", result: "A battery report was provided but no state-of-health figure could be read from it.", nextAction: "Check the report manually or arrange an independent battery test.", decisionImpact: true, requiresReview: true };
  }
  if (vinFinding.status === "conflict" || ageFinding.status === "conflict") {
    return { ...base, status: "conflict", result: `Report states ${reported.join("; ")}, but the report failed the ${vinFinding.status === "conflict" ? "VIN" : "age"} check, so it cannot be relied on for this vehicle.`, nextAction: "Arrange an independent battery test.", decisionImpact: true, requiresReview: true };
  }
  if (vinFinding.status !== "consistent") {
    return { ...base, status: "unknown", result: `Report states ${reported.join("; ")}, but it could not be linked to this vehicle's VIN.`, nextAction: "Ask the provider for a report that names the VIN.", decisionImpact: true, requiresReview: true };
  }
  return {
    ...base,
    status: "consistent",
    result: `Report states ${reported.join("; ")}. It names this vehicle's VIN and is recent. VoltProof shows the figure exactly as reported. It did not test the battery and has not confirmed the report with its issuer.`,
    nextAction: null,
    decisionImpact: false,
    requiresReview: false,
  };
}

export function currentOdometer(input: RuleInput): Finding {
  const evidence: EvidenceRef[] = [];
  const captured = readDocs(input.documents).filter((d) => d.provenance === "dealer_captured" && usable(d, "odometer").state === "ok");
  const base = {
    id: "current-odometer",
    ruleId: "current_odometer",
    category: "odometer" as const,
    title: "Current odometer",
    checked: "Whether dealership staff recorded the current odometer reading themselves (for example a dashboard photo taken at inspection).",
    evidence,
    whyItMatters: "A reading captured by the dealership does not depend on the seller's paperwork.",
  };
  if (!captured.length) {
    return { ...base, status: "unknown", result: "No dealer-captured odometer reading is on file.", nextAction: "Photograph the dashboard odometer during inspection and upload it as dealer-captured.", decisionImpact: true, requiresReview: false };
  }
  const latest = captured
    .map((d) => ({ d, date: readingDate(d)?.value ?? "" }))
    .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  const o = usable(latest.d, "odometer");
  evidence.push(ref(latest.d, "odometer", `Uploaded by ${latest.d.uploadedBy}, marked as captured by dealership staff`));
  return {
    ...base,
    status: "verified",
    result: `What was verified: dealership staff photographed the dashboard${latest.date ? ` on ${latest.date}` : ""} and it shows ${formatOdometer(o.state === "ok" ? (o.value as Odometer) : { reading: 0, unit: "km" })}. This verifies the reading on the instrument cluster on that day. It does not verify the vehicle's mileage history.`,
    nextAction: null,
    decisionImpact: false,
    requiresReview: false,
  };
}

// ---------------------------------------------------------------------------
// Extraction quality, integrity and authenticity findings

const DECISION_FIELDS: FieldName[] = ["vin", "odometer", "documentDate", "batteryTestDate", "batterySohPercent"];

export function extractionFindings(input: RuleInput): Finding[] {
  const out: Finding[] = [];
  for (const doc of input.documents) {
    if (doc.extractionStatus === "failed" || doc.extractionStatus === "not_configured") {
      out.push({
        id: `document-not-read:${doc.id}`,
        ruleId: "document_not_read",
        category: "extraction",
        title: "Document not read",
        checked: "Whether information could be extracted from this document.",
        evidence: [{ documentId: doc.id, documentName: doc.filename, field: "File", value: doc.filename, page: null, quote: null, confidence: null, note: doc.extractionError ?? undefined }],
        status: "unknown",
        result: doc.extractionStatus === "not_configured" ? "The document was stored and fingerprinted but not read, because AI extraction is not configured." : `Extraction failed: ${doc.extractionError ?? "unknown error"}.`,
        whyItMatters: "Facts in this document are not included in any check.",
        nextAction: "Review the document manually, or retry extraction once AI is configured.",
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
    out.push({
      id: `extraction-unsupported:${doc.id}`,
      ruleId: "extraction_unsupported",
      category: "extraction",
      title: "Extracted values need confirmation",
      checked: "Whether each extracted value is backed by a quote from the document and meets the confidence threshold.",
      evidence: weak.map((k) => ref(doc, k, doc.extraction!.fields[k].unsupportedReason)),
      status: "unknown",
      result: `${plural(weak.length, "value")} in ${docLabel(doc)} ${weak.length === 1 ? "was" : "were"} excluded from the checks: ${weak.map((k) => FIELD_LABEL[k]).join(", ")}.`,
      whyItMatters: "These values were not used, so related checks may be incomplete.",
      nextAction: "Open the document, read the values yourself and record what you see in a note.",
      decisionImpact: weak.some((k) => DECISION_FIELDS.includes(k)),
      requiresReview: true,
    });
  }
  return out;
}

/** Why a document should not be relied on for verification, if anything. */
export function documentIntegrityIssue(doc: CaseDocument): string | null {
  const sig = doc.forensics?.signatures.find((x) => x.integrity === "invalid");
  if (sig) return "its digital signature no longer matches the content";
  const f = doc.forensics?.indicators.find((i) => i.severity === "potential");
  if (f) return "a forensic check found a possible edit";
  const i = doc.integrity.indicators.find((x) => x.severity === "potential");
  if (i) return "file checks found possible signs of alteration";
  if ((doc.verifications ?? []).some((v) => v.outcome === "denied")) return "the issuer said it did not issue this document";
  return null;
}

export function integrityFindings(input: RuleInput): Finding[] {
  const out: Finding[] = [];
  for (const doc of input.documents) {
    const fileLevel = doc.integrity.indicators.filter((i) => i.severity === "potential");
    const forensic = (doc.forensics?.indicators ?? []).filter((i) => i.severity === "potential");
    if (!fileLevel.length && !forensic.length) continue;
    const fields = Array.from(new Set(forensic.map((i) => i.field).filter((f): f is FieldName => !!f)));
    const evidence: EvidenceRef[] = [
      ...forensic.map((i) =>
        i.field
          ? ref(doc, i.field, i.message)
          : { documentId: doc.id, documentName: docLabel(doc), field: "Forensic check", value: i.code, page: i.page ?? null, quote: null, confidence: null, note: i.message },
      ),
      ...fileLevel.map((i) => ({ documentId: doc.id, documentName: docLabel(doc), field: "File check", value: i.code, page: null, quote: null, confidence: null, note: i.message })),
    ];
    out.push({
      id: `integrity:${doc.id}`,
      ruleId: "integrity_indicators",
      category: "integrity",
      title: fields.length ? `Possible edit to the ${joinList(fields.map(fieldLabelInline))}` : "Possible signs of document alteration",
      checked: "File checks (type, editing software, revision history), digital signatures, and checks on each value: text typed over other text, values in a font nothing else on the page uses, notes laid over values, and areas of a photo that look pasted in or retouched.",
      evidence,
      // A check that ties a possible edit to a specific value failed, as does a broken signature: both are
      // Conflicts, like the claims resting on them. File-level hints alone (e.g. editing software) stay Unknown.
      status: fields.length || forensic.some((i) => i.code === "signature_broken") ? "conflict" : "unknown",
      result:
        (fields.length
          ? `${plural(fields.length, "value")} in ${docLabel(doc)} show${fields.length === 1 ? "s" : ""} possible signs of editing, so ${fields.length === 1 ? "it is" : "they are"} not used by any check. `
          : `Potential indicators were found in ${docLabel(doc)}. `) +
        "These are not proof of tampering: some have harmless explanations, such as a re-saved scan or a corrected invoice.",
      whyItMatters: "If a value was changed after the document was issued, any claim it seems to support is unproven.",
      nextAction: "Ask for the original file directly from the issuer, or confirm the values with the issuer by phone or email.",
      decisionImpact: true,
      requiresReview: true,
    });
  }
  return out;
}

export function signatureFindings(input: RuleInput): Finding[] {
  return input.documents
    .filter((d) => d.forensics?.signatures.length)
    .map((doc) => {
      const sigs = doc.forensics!.signatures;
      const broken = sigs.find((x) => x.integrity === "invalid");
      const good = sigs.find((x) => x.integrity === "valid");
      const evidence: EvidenceRef[] = sigs.map((x) => ({
        documentId: doc.id,
        documentName: docLabel(doc),
        field: "Digital signature",
        value: x.signer ? `${x.signer}${x.organization && x.organization !== x.signer ? ` (${x.organization})` : ""}` : "Unknown signer",
        page: null,
        quote: null,
        confidence: null,
        note: x.detail,
      }));
      const base = {
        id: `signature:${doc.id}`,
        ruleId: "pdf_signature",
        category: "authenticity" as const,
        title: `Digital signature · ${doc.filename}`,
        checked: "Whether the PDF carries a cryptographic signature, whether the signed content is unchanged, and whether the signer's certificate is on VoltProof's trust list of known issuers.",
        evidence,
        whyItMatters: "A valid signature from a known issuer proves the file is exactly what that issuer signed. A visible stamp or drawn signature does not.",
      };
      if (broken) {
        return { ...base, status: "conflict" as Status, result: `The signature${broken.signer ? ` by ${broken.signer}` : ""} does not match the document: the signed content was changed after signing.`, nextAction: "Do not rely on this file. Get a fresh copy directly from the issuer.", decisionImpact: true, requiresReview: true };
      }
      if (good && good.trustedAs && good.coversWholeFile) {
        return { ...base, status: "verified" as Status, result: `What was verified: the file is exactly what ${good.trustedAs} signed${good.signedAt ? ` on ${good.signedAt.slice(0, 10)}` : ""}. The signing certificate is on the trust list. This verifies who issued the file and that it is unchanged, not that its contents are true.`, nextAction: null, decisionImpact: false, requiresReview: false };
      }
      if (good) {
        const why = !good.coversWholeFile ? "content was added after signing" : "the signing certificate is not on the trust list";
        return { ...base, status: "consistent" as Status, result: `The signed content is unchanged since ${good.signer ?? "the signer"} signed it, but ${why}, so the issuer is not confirmed.`, nextAction: good.coversWholeFile ? "Add the issuer's certificate to the trust list once you have confirmed it with them." : "Ask the issuer for the signed original.", decisionImpact: false, requiresReview: false };
      }
      return { ...base, status: "unknown" as Status, result: sigs[0].detail || "The signature could not be checked.", nextAction: "Open the file in a PDF reader that validates signatures, or ask the issuer for the original.", decisionImpact: false, requiresReview: false };
    });
}

export function authenticityFinding(input: RuleInput): Finding {
  const confirmedBy = new Map<string, string>();
  const denied: string[] = [];
  for (const d of input.documents) {
    const sig = d.forensics?.signatures.find((x) => x.integrity === "valid" && x.trustedAs && x.coversWholeFile);
    if (sig) confirmedBy.set(d.id, `digital signature from ${sig.trustedAs}`);
    const v = [...(d.verifications ?? [])].reverse()[0];
    if (v?.outcome === "confirmed" && !confirmedBy.has(d.id)) confirmedBy.set(d.id, `confirmed with the issuer by ${v.by} (${v.method.replace(/_/g, " ")}${v.reference ? `, ref. ${v.reference}` : ""})`);
    if (v?.outcome === "denied") denied.push(docLabel(d));
  }
  const evidence: EvidenceRef[] = input.documents.map((d) => ({
    documentId: d.id,
    documentName: docLabel(d),
    field: "Issuer verification",
    value: confirmedBy.get(d.id) ?? ((d.verifications ?? []).some((v) => v.outcome === "denied") ? "Issuer denied issuing it" : "Not performed"),
    page: null,
    quote: null,
    confidence: null,
  }));
  const base = {
    id: "authenticity",
    ruleId: "authenticity_not_verified",
    category: "authenticity" as const,
    title: "Authenticity not verified",
    checked: "Whether each document has been confirmed with its issuer: by a valid digital signature from a certificate on the trust list, or by a person checking with the issuer or a registry.",
    evidence,
    whyItMatters: "Consistent documents can still all be false. Only the issuer, or the issuer's signature, can confirm a document.",
  };
  if (denied.length) {
    return { ...base, title: "Issuer denied a document", status: "conflict", result: `The issuer said it did not issue: ${denied.join("; ")}.`, nextAction: "Treat the document as not genuine and ask the seller to explain.", decisionImpact: true, requiresReview: true };
  }
  if (input.documents.length && confirmedBy.size === input.documents.length) {
    return { ...base, title: "Authenticity confirmed with issuers", status: "verified", result: `Every document was confirmed with its issuer: ${[...confirmedBy.values()].join("; ")}.`, nextAction: null, decisionImpact: false, requiresReview: false };
  }
  return {
    ...base,
    status: "unknown",
    result:
      (confirmedBy.size ? `${plural(confirmedBy.size, "document")} of ${input.documents.length} confirmed with the issuer (${[...confirmedBy.values()].join("; ")}). The others are not. ` : "No document has been confirmed with its issuer. ") +
      "Matching values, clean file checks and visible stamps or signatures do not prove a document is genuine.",
    nextAction: "For high-value decisions, confirm the key documents with the issuing workshop, test provider or registry, and record it.",
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
export function ruleCheckTitles(): string[] {
  const empty: RuleInput = { vehicle: { make: "", model: "", year: null, vin: "" }, documents: [], referenceDate: "2000-01-01" };
  return runRules(empty, { batteryReportMaxAgeDays: 90 })
    .filter((f) => f.category !== "authenticity")
    .map((f) => f.title);
}

export function runRules(input: RuleInput, opts: RuleOptions): Finding[] {
  const vin = vinConsistency(input);
  const vehicle = vehicleConsistency(input);
  const mileage = mileageTimeline(input);
  const dates = dateConsistency(input);
  const bVin = batteryReportVin(input);
  const bAge = batteryReportAge(input, opts);
  return [
    vin,
    vinStructure(input),
    registrationConsistency(input),
    vehicle,
    mileage,
    currentOdometer(input),
    dates,
    batteryHealthEvidence(input, bVin, bAge),
    bVin,
    bAge,
    ...extractionFindings(input),
    ...integrityFindings(input),
    ...signatureFindings(input),
    authenticityFinding(input),
  ];
}
