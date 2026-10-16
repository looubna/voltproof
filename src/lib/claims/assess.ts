// Claim assessment: gives each seller claim exactly one status, from the
// cited fields and the rule findings. Pure code, no I/O, no model calls.
//
// Precedence: Conflict > Verified > Consistent > Unknown.
//   Verified   — an independent source confirms the claim.
//   Consistent — records agree with the claim, but none proves it outright.
//   Conflict   — a grounded source contradicts the claim.
//   Unknown    — no usable evidence either way. Missing, not wrong.
//
// Only supported fields are used (quote present, confidence above threshold,
// quote found in the document), so a misread cannot create a conflict.

import { CLAIM_TYPE_LABEL, DOC_TYPE_LABEL } from "../labels";
import { daysBetween, formatOdometer, normalizeVin, parseIsoDate, toKm, vinTail } from "../normalize";
import { docLabel, docTypeOf, documentIntegrityIssue, isBatteryReport, readDocs, readingDate, ref, usable, type RuleInput } from "../rules";
import type { CaseDocument, Claim, ClaimAssessmentInfo, DocumentType, EvidenceRef, FieldName, Finding, Odometer, Provenance, Status } from "../types";

export const ASSESSOR_VERSION = "2026.10.3";

export interface ClaimPolicy {
  sohTolerancePts: number;
  batteryReportMaxAgeDays: number;
  odometerToleranceKm: number;
  odometerFreshDays: number;
  /** Percentage points a charging log may exceed the claimed DC share before it contradicts it. */
  chargingTolerancePts: number;
  /** Months of clean service history needed for a "no accidents" claim to be Consistent. */
  accidentHistoryMinMonths: number;
}

export const DEFAULT_POLICY: ClaimPolicy = {
  sohTolerancePts: 2,
  batteryReportMaxAgeDays: 90,
  odometerToleranceKm: 500,
  odometerFreshDays: 30,
  chargingTolerancePts: 10,
  accidentHistoryMinMonths: 12,
};

/** Sources the buyer or lender obtained themselves, not the seller. */
const INDEPENDENT: Provenance[] = ["dealer_ordered", "dealer_captured"];

function listJoin(xs: string[]) {
  return xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

function km(n: number) {
  return `${Math.round(n).toLocaleString("en-US")} km`;
}

export function claimLabel(c: Claim): string {
  const s = c.stated;
  switch (c.type) {
    case "battery_soh":
      return `Battery health: ${s.number}% claimed`;
    case "odometer":
      return `Mileage: ${formatOdometer({ reading: s.number ?? 0, unit: s.unit === "mi" ? "mi" : "km" })} claimed`;
    case "accident_history":
      return s.flag ? "Accident history: seller reports damage" : "Accident history: seller says none";
    case "fast_charging":
      return s.text ? `Fast-charging history: “${s.text}”` : `Fast-charging history: at most ${s.number}% DC claimed`;
  }
}

interface Outcome {
  status: Status;
  headline: string;
  result: string;
  evidence: EvidenceRef[];
  nextAction: string | null;
  missing: string | null;
  /** The document that decided the status; its evidence is listed first. */
  decidedBy?: CaseDocument;
}

const FIELD_LABEL_SHORT: Partial<Record<FieldName, string>> = {
  batterySohPercent: "battery health figure",
  vin: "VIN",
  batteryTestDate: "test date",
  odometer: "odometer reading",
  documentDate: "date",
  damageRepair: "repair record",
  serviceDetails: "service details",
  dcChargingSharePercent: "charging figure",
};

const WHY: Record<Claim["type"], string> = {
  battery_soh: "The battery is most of what a used EV is worth, and the hardest part to check.",
  odometer: "Mileage drives value and wear. A true mileage higher than claimed changes what the car is worth and how a lender sees it.",
  accident_history: "Undisclosed accident damage affects safety, value and insurability.",
  fast_charging: "Frequent DC fast charging can speed up battery wear, so it bears on future battery health.",
};

function refDate(input: RuleInput) {
  const p = parseIsoDate(input.referenceDate.slice(0, 10));
  return p.ok ? p.date : new Date();
}

function sourceName(doc: CaseDocument) {
  const issuer = usable(doc, "issuer");
  const provider = usable(doc, "batteryTestProvider");
  if (provider.state === "ok") return String(provider.value);
  if (issuer.state === "ok") return String(issuer.value);
  return docLabel(doc);
}

// ---------------------------------------------------------------- battery health

function assessSoh(claim: Claim, input: RuleInput, policy: ClaimPolicy): Outcome {
  const claimed = claim.stated.number ?? NaN;
  const caseVin = input.vehicle.vin ? normalizeVin(input.vehicle.vin) : "";
  const reference = refDate(input);
  const evidence: EvidenceRef[] = [];

  type Rep = { doc: CaseDocument; soh: number; linked: boolean; otherVin: string | null; days: number | null; iso: string | null };
  const reps: Rep[] = [];
  for (const doc of readDocs(input.documents).filter(isBatteryReport)) {
    const soh = usable(doc, "batterySohPercent");
    if (soh.state === "absent") continue;
    if (soh.state === "excluded") {
      evidence.push(ref(doc, "batterySohPercent", `Not used: ${soh.reason}`));
      continue;
    }
    const vin = usable(doc, "vin");
    const v = vin.state === "ok" ? normalizeVin(String(vin.value)) : null;
    const dateName = usable(doc, "batteryTestDate").state === "ok" ? "batteryTestDate" : "documentDate";
    const d = usable(doc, dateName);
    const parsed = d.state === "ok" ? parseIsoDate(String(d.value)) : null;
    const days = parsed && parsed.ok ? daysBetween(parsed.date, reference) : null;
    reps.push({ doc, soh: Number(soh.value), linked: !!v && !!caseVin && v === caseVin, otherVin: v && caseVin && v !== caseVin ? v : null, days, iso: parsed && parsed.ok ? parsed.iso : null });
    evidence.push(ref(doc, "batterySohPercent"));
    if (vin.state !== "absent") evidence.push(ref(doc, "vin", vin.state === "excluded" ? `Not used: ${vin.reason}` : undefined));
    if (d.state !== "absent") evidence.push(ref(doc, dateName, days !== null ? `${days} days before the review date` : undefined));
  }

  const lower = reps.filter((r) => !r.otherVin && r.soh < claimed - policy.sohTolerancePts);
  if (lower.length) {
    const r = lower.sort((a, b) => a.soh - b.soh)[0];
    return {
      status: "conflict",
      headline: `A battery report states ${r.soh}%, ${Math.round((claimed - r.soh) * 10) / 10} points below the claim.`,
      result: `${sourceName(r.doc)} reported a state of health of ${r.soh}%${r.iso ? ` on ${r.iso}` : ""}. The seller claims ${claimed}%. The allowed difference is ${policy.sohTolerancePts} points.`,
      evidence,
      nextAction: "Ask the seller where the claimed figure comes from, and base the decision on the measured figure.",
      missing: null,
      decidedBy: r.doc,
    };
  }
  const confirming = reps.filter((r) => !r.otherVin && r.soh >= claimed - policy.sohTolerancePts);
  const wrong = reps.filter((r) => r.otherVin);
  if (!confirming.length && wrong.length) {
    return {
      status: "conflict",
      headline: `The battery report offered names a different VIN (ending ${vinTail(wrong[0].otherVin!)}).`,
      result: `The only battery report provided is for VIN ending ${vinTail(wrong[0].otherVin!)}, not this vehicle (ending ${vinTail(caseVin)}). It cannot support the ${claimed}% claim.`,
      evidence,
      nextAction: "Do not rely on this report. Arrange an independent battery test for this VIN.",
      missing: null,
      decidedBy: wrong[0].doc,
    };
  }
  const verifiedBy = confirming.find((r) => r.linked && INDEPENDENT.includes(r.doc.provenance) && r.days !== null && r.days >= 0 && r.days <= policy.batteryReportMaxAgeDays && !documentIntegrityIssue(r.doc));
  if (verifiedBy) {
    return {
      status: "verified",
      headline: `Matches a diagnostic readout from ${verifiedBy.days} days before this review (${verifiedBy.soh}%).`,
      decidedBy: verifiedBy.doc,
      result: `${sourceName(verifiedBy.doc)} reported ${verifiedBy.soh}% on ${verifiedBy.iso}, for this VIN. The report was obtained independently of the seller and is within the ${policy.batteryReportMaxAgeDays}-day limit, and the figure is within ${policy.sohTolerancePts} points of the ${claimed}% claimed.${signedNote(verifiedBy.doc)}`,
      evidence,
      nextAction: null,
      missing: null,
    };
  }
  if (confirming.length) {
    const r = confirming[0];
    const issue = documentIntegrityIssue(r.doc);
    const why = issue
      ? `${issue}`
      : !r.linked
      ? "the report does not show this vehicle's VIN"
      : !INDEPENDENT.includes(r.doc.provenance)
        ? "the report came from the seller, not from an independent request"
        : r.days === null
          ? "the report has no usable test date"
          : `the test is ${r.days} days old, beyond the ${policy.batteryReportMaxAgeDays}-day limit`;
    return {
      status: "consistent",
      headline: `A battery report agrees (${r.soh}%), but ${why}.`,
      decidedBy: r.doc,
      result: `${sourceName(r.doc)} reported ${r.soh}%, in line with the ${claimed}% claimed. It is not counted as verification because ${why}.`,
      evidence,
      nextAction: "Order an independent battery test for this VIN to verify the figure.",
      missing: null,
    };
  }
  return {
    status: "unknown",
    headline: "No battery health report provided yet.",
    result: `Nothing on file states this vehicle's battery state of health, so the ${claimed}% claim is not checked.`,
    evidence,
    nextAction: "Order an independent battery test for this VIN before making an offer.",
    missing: `A battery health report for this VIN from the last ${policy.batteryReportMaxAgeDays} days.`,
  };
}

// ---------------------------------------------------------------- mileage

function assessOdometer(claim: Claim, input: RuleInput, findings: Finding[], policy: ClaimPolicy): Outcome {
  const claimOdo: Odometer = { reading: claim.stated.number ?? NaN, unit: claim.stated.unit === "mi" ? "mi" : "km" };
  const claimKm = toKm(claimOdo);
  const reference = refDate(input);
  const evidence: EvidenceRef[] = [];
  type R = { doc: CaseDocument; km: number; odo: Odometer; iso: string; days: number };
  const readings: R[] = [];
  for (const doc of readDocs(input.documents)) {
    const o = usable(doc, "odometer");
    if (o.state === "absent") continue;
    if (o.state === "excluded") {
      evidence.push(ref(doc, "odometer", `Not used: ${o.reason}`));
      continue;
    }
    const rd = readingDate(doc);
    const p = rd ? parseIsoDate(rd.value) : null;
    if (!p || !p.ok) {
      evidence.push(ref(doc, "odometer", "Not used: the document has no usable date"));
      continue;
    }
    const odo = o.value as Odometer;
    readings.push({ doc, km: toKm(odo), odo, iso: p.iso, days: daysBetween(p.date, reference) });
    evidence.push(ref(doc, "odometer", `Dated ${p.iso}`));
  }
  readings.sort((a, b) => (a.iso < b.iso ? -1 : 1));

  const above = readings.filter((r) => r.km > claimKm + policy.odometerToleranceKm);
  if (above.length) {
    const r = above[above.length - 1];
    return {
      status: "conflict",
      headline: `${DOC_TYPE_LABEL[docTypeOf(r.doc) ?? "other"]} shows ${formatOdometer(r.odo)} on ${r.iso}, above the claim.`,
      result: `${docLabel(r.doc)} records ${formatOdometer(r.odo)} on ${r.iso}, which is ${km(r.km - claimKm)} more than the ${formatOdometer(claimOdo)} claimed. The car cannot have fewer kilometres now than it had then.`,
      evidence,
      nextAction: "Read the odometer yourself and ask the seller to explain the difference.",
      missing: null,
      decidedBy: r.doc,
    };
  }
  const fresh = readings.filter((r) => r.doc.provenance === "dealer_captured" && r.days >= 0 && r.days <= policy.odometerFreshDays && !documentIntegrityIssue(r.doc));
  const freshMismatch = fresh.find((r) => Math.abs(r.km - claimKm) > policy.odometerToleranceKm);
  if (freshMismatch) {
    return {
      status: "conflict",
      headline: `The dashboard showed ${formatOdometer(freshMismatch.odo)} on ${freshMismatch.iso}, not the figure claimed.`,
      result: `Dealership staff recorded ${formatOdometer(freshMismatch.odo)} on ${freshMismatch.iso}. The seller claims ${formatOdometer(claimOdo)}, a difference of ${km(Math.abs(freshMismatch.km - claimKm))}.`,
      evidence,
      nextAction: "Correct the listing to the reading on the dashboard.",
      missing: null,
      decidedBy: freshMismatch.doc,
    };
  }
  const timeline = findings.find((f) => f.id === "mileage-timeline");
  if (timeline?.status === "conflict") {
    return {
      status: "conflict",
      headline: "The mileage records go down over time, so the claimed figure cannot be relied on.",
      result: timeline.result,
      evidence: [...evidence, ...timeline.evidence.filter((e) => !evidence.some((x) => x.documentId === e.documentId && x.field === e.field))],
      nextAction: timeline.nextAction,
      missing: null,
    };
  }
  if (fresh.length) {
    const r = fresh[fresh.length - 1];
    return {
      status: "verified",
      headline: `Matches the dashboard reading taken by dealership staff on ${r.iso}.`,
      decidedBy: r.doc,
      result: `Dealership staff photographed the odometer on ${r.iso} showing ${formatOdometer(r.odo)}, within ${km(policy.odometerToleranceKm)} of the ${formatOdometer(claimOdo)} claimed.`,
      evidence,
      nextAction: null,
      missing: null,
    };
  }
  if (readings.length) {
    const latest = readings[readings.length - 1];
    const kinds = Array.from(new Set(readings.map((r) => docTypeOf(r.doc)).filter((t): t is DocumentType => !!t).map((t) => DOC_TYPE_LABEL[t].toLowerCase())));
    return {
      status: "consistent",
      headline: `In line with ${kinds.length ? listJoin(kinds) : "earlier"} records.`,
      decidedBy: latest.doc,
      result: `${readings.length} dated reading${readings.length === 1 ? "" : "s"}, the latest ${formatOdometer(latest.odo)} on ${latest.iso}, are at or below the ${formatOdometer(claimOdo)} claimed, and the timeline does not go backwards. No current reading by dealership staff yet, so this is not verification.`,
      evidence,
      nextAction: "Photograph the dashboard odometer at inspection to verify the current reading.",
      missing: null,
    };
  }
  return {
    status: "unknown",
    headline: "No dated odometer records provided yet.",
    result: `Nothing on file states the odometer, so the ${formatOdometer(claimOdo)} claim is not checked.`,
    evidence,
    nextAction: "Photograph the dashboard odometer and ask for dated service invoices.",
    missing: "A dashboard photo taken at inspection, or dated service invoices showing the odometer.",
  };
}

// ---------------------------------------------------------------- accident history

const HISTORY_TYPES: DocumentType[] = ["service_invoice", "insurance_or_repair_record", "purchase_invoice"];

function assessAccident(claim: Claim, input: RuleInput, policy: ClaimPolicy): Outcome {
  const evidence: EvidenceRef[] = [];
  const repairs: { doc: CaseDocument; text: string; iso: string | null }[] = [];
  const history: { doc: CaseDocument; iso: string }[] = [];
  for (const doc of readDocs(input.documents)) {
    const r = usable(doc, "damageRepair");
    const d = usable(doc, "documentDate");
    const p = d.state === "ok" ? parseIsoDate(String(d.value)) : null;
    const iso = p && p.ok ? p.iso : null;
    if (r.state === "excluded") evidence.push(ref(doc, "damageRepair", `Not used: ${r.reason}`));
    if (r.state === "ok") {
      repairs.push({ doc, text: String(r.value), iso });
      evidence.push(ref(doc, "damageRepair", iso ? `Dated ${iso}` : undefined));
    } else if (iso && HISTORY_TYPES.includes(docTypeOf(doc) ?? "other")) {
      history.push({ doc, iso });
      const s = usable(doc, "serviceDetails");
      evidence.push(s.state === "ok" ? ref(doc, "serviceDetails", "No damage repair mentioned") : ref(doc, "documentDate", "No damage repair mentioned"));
    }
  }

  if (claim.stated.flag === true) {
    if (repairs.length) {
      return {
        status: "consistent",
        headline: `Records show the repair the seller disclosed (${repairs[0].text}).`,
      decidedBy: repairs[0].doc,
        result: `${docLabel(repairs[0].doc)} describes: “${repairs[0].text}”. This agrees with the seller's disclosure.`,
        evidence,
        nextAction: "Check the quality of the repair at inspection.",
        missing: null,
      };
    }
    return {
      status: "unknown",
      headline: "The seller reports damage, but no repair record is on file.",
      result: "No document describes the damage or its repair.",
      evidence,
      nextAction: "Ask the seller for the repair invoice or insurance claim.",
      missing: "The repair invoice or insurance claim for the reported damage.",
    };
  }

  if (repairs.length) {
    const r = repairs[0];
    const type = docTypeOf(r.doc);
    return {
      status: "conflict",
      headline: `${type === "insurance_or_repair_record" ? "An insurance record" : `A ${DOC_TYPE_LABEL[type ?? "other"].toLowerCase()}`} lists ${repairs.length === 1 ? "one damage repair" : `${repairs.length} damage repairs`}.`,
      result: `The seller says the car has had no accidents, but ${docLabel(r.doc)}${r.iso ? ` (${r.iso})` : ""} describes: “${r.text}”.`,
      evidence,
      nextAction: "Ask the seller about the repair, get the repair invoice, and have the repaired area inspected.",
      missing: null,
      decidedBy: r.doc,
    };
  }
  const dates = history.map((h) => h.iso).sort();
  const months = dates.length >= 2 ? Math.floor(daysBetween(new Date(dates[0]), new Date(dates[dates.length - 1])) / 30.44) : 0;
  if (history.length >= 2 && months >= policy.accidentHistoryMinMonths) {
    return {
      status: "consistent",
      headline: `${history.length} records over ${months} months mention no damage repair.`,
      result: `${history.length} dated service or repair records from ${dates[0]} to ${dates[dates.length - 1]} mention no collision, body or structural repair. Records only show work that was recorded, so this is not proof that no accident happened.`,
      evidence,
      nextAction: "For a lending decision, ask for an insurance claims history for this VIN.",
      missing: null,
    };
  }
  return {
    status: "unknown",
    headline: "No insurance or repair history provided yet.",
    result: `Fewer than ${policy.accidentHistoryMinMonths} months of service history are on file, and no insurance or repair record, so the claim is not checked.`,
    evidence,
    nextAction: "Ask the seller for an insurance claims history for this VIN.",
    missing: "An insurance claims history or a repair history for this VIN.",
  };
}

// ---------------------------------------------------------------- fast charging

function assessCharging(claim: Claim, input: RuleInput, policy: ClaimPolicy): Outcome {
  const max = claim.stated.number ?? 30;
  const evidence: EvidenceRef[] = [];
  const logs: { doc: CaseDocument; share: number }[] = [];
  for (const doc of readDocs(input.documents)) {
    const u = usable(doc, "dcChargingSharePercent");
    if (u.state === "absent") continue;
    if (u.state === "excluded") {
      evidence.push(ref(doc, "dcChargingSharePercent", `Not used: ${u.reason}`));
      continue;
    }
    logs.push({ doc, share: Number(u.value) });
    evidence.push(ref(doc, "dcChargingSharePercent"));
  }
  const over = logs.filter((l) => l.share > max + policy.chargingTolerancePts);
  if (over.length) {
    const l = over[0];
    return {
      status: "conflict",
      headline: `A charging log shows ${l.share}% DC fast charging.`,
      decidedBy: l.doc,
      result: `${docLabel(l.doc)} states ${l.share}% DC fast charging. The claim allows about ${max}%.`,
      evidence,
      nextAction: "Ask about charging habits and weigh the battery test result more heavily.",
      missing: null,
    };
  }
  const indep = logs.find((l) => INDEPENDENT.includes(l.doc.provenance) && !documentIntegrityIssue(l.doc));
  if (indep) {
    return {
      status: "verified",
      headline: `An independently obtained charging log shows ${indep.share}% DC fast charging.`,
      decidedBy: indep.doc,
      result: `${docLabel(indep.doc)} states ${indep.share}% DC fast charging, in line with the claim (about ${max}% or less).`,
      evidence,
      nextAction: null,
      missing: null,
    };
  }
  if (logs.length) {
    return {
      status: "consistent",
      headline: `A seller-provided charging log agrees (${logs[0].share}% DC).`,
      decidedBy: logs[0].doc,
      result: `${docLabel(logs[0].doc)} states ${logs[0].share}% DC fast charging. It came from the seller, so it is not verification.`,
      evidence,
      nextAction: "Request a charging export directly from the vehicle's app or the manufacturer.",
      missing: null,
    };
  }
  return {
    status: "unknown",
    headline: "No charging data provided yet.",
    result: "Nothing on file states how the car was charged, so the claim is not checked.",
    evidence,
    nextAction: "Ask the seller for a charging history export from the vehicle's app.",
    missing: "A charging history export from the vehicle's app or the manufacturer.",
  };
}

function signedNote(doc: CaseDocument) {
  const s = doc.forensics?.signatures.find((x) => x.integrity === "valid" && x.trustedAs && x.coversWholeFile);
  return s ? ` The report carries a valid digital signature from ${s.trustedAs}, so it is exactly what the provider issued.` : "";
}

/** Fields whose value a claim of each type relies on. */
const CLAIM_FIELDS: Record<Claim["type"], FieldName[]> = {
  battery_soh: ["batterySohPercent", "vin", "batteryTestDate"],
  odometer: ["odometer", "documentDate"],
  accident_history: ["damageRepair", "serviceDetails"],
  fast_charging: ["dcChargingSharePercent"],
};

/** A value this claim depends on that a forensic check says may have been edited. */
function tamperedEvidence(claim: Claim, input: RuleInput) {
  for (const doc of readDocs(input.documents)) {
    if (claim.type === "battery_soh" && !isBatteryReport(doc)) continue;
    for (const f of CLAIM_FIELDS[claim.type]) {
      const field = doc.extraction?.fields[f];
      if (field?.tamperIndicator && field.value !== null) return { doc, field: f, message: field.tamperIndicator };
    }
  }
  return null;
}

// ---------------------------------------------------------------- entry point

export function activeClaims(claims: Claim[] | undefined) {
  return (claims ?? []).filter((c) => !c.withdrawn);
}

export function assessClaim(claim: Claim, input: RuleInput, findings: Finding[], policy: ClaimPolicy = DEFAULT_POLICY): Finding {
  const t = tamperedEvidence(claim, input);
  const o: Outcome = t
    ? {
        status: "conflict",
        headline: `The ${(FIELD_LABEL_SHORT[t.field] ?? t.field)} on ${t.doc.filename} shows signs of editing.`,
        result: `${t.message} The value is not used, and the claim cannot rest on this document until the issuer confirms it.`,
        evidence: [ref(t.doc, t.field, "Possible edit found by a forensic check")],
        nextAction: "Get the original directly from the issuer, or confirm the value with them, before relying on this claim.",
        missing: null,
        decidedBy: t.doc,
      }
    :
    claim.type === "battery_soh"
      ? assessSoh(claim, input, policy)
      : claim.type === "odometer"
        ? assessOdometer(claim, input, findings, policy)
        : claim.type === "accident_history"
          ? assessAccident(claim, input, policy)
          : assessCharging(claim, input, policy);
  const label = claimLabel(claim);
  if (o.decidedBy) {
    const id = o.decidedBy.id;
    o.evidence = [...o.evidence.filter((e) => e.documentId === id), ...o.evidence.filter((e) => e.documentId !== id)];
  }
  const info: ClaimAssessmentInfo = { claimId: claim.id, type: claim.type, label, headline: o.headline, missing: o.missing, assessorVersion: ASSESSOR_VERSION };
  return {
    id: `claim:${claim.id}`,
    ruleId: `claim_${claim.type}`,
    category: "claim",
    title: label,
    checked: `Whether the documents on file support the seller's claim about ${CLAIM_TYPE_LABEL[claim.type].toLowerCase()}${claim.sourceText ? ` (“${claim.sourceText}”)` : ""}.`,
    evidence: o.evidence,
    status: o.status,
    result: o.result,
    whyItMatters: WHY[claim.type],
    nextAction: o.nextAction,
    decisionImpact: o.status === "conflict" || o.status === "unknown",
    requiresReview: o.status === "conflict",
    claim: info,
  };
}

export function assessClaims(claims: Claim[] | undefined, input: RuleInput, findings: Finding[], policy: ClaimPolicy = DEFAULT_POLICY): Finding[] {
  return activeClaims(claims).map((c) => assessClaim(c, input, findings, policy));
}

/** "1 conflict to review before you pay. 2 claims backed by evidence, 1 still missing." */
export function claimSummaryLine(assessments: Finding[]): string | null {
  if (!assessments.length) return null;
  const n = (s: Status) => assessments.filter((a) => a.status === s).length;
  const conflicts = n("conflict");
  const backed = n("verified") + n("consistent");
  const missing = n("unknown");
  const parts: string[] = [];
  parts.push(conflicts ? `${conflicts} conflict${conflicts === 1 ? "" : "s"} to review before you pay.` : "No conflicts found.");
  const tail: string[] = [];
  if (backed) tail.push(`${backed} claim${backed === 1 ? "" : "s"} backed by evidence`);
  if (missing) tail.push(`${missing} still missing`);
  if (tail.length) parts.push(tail.join(", ") + ".");
  return parts.join(" ");
}
