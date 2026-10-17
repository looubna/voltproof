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
//
// Wording comes from a RuleText (src/i18n/rules), English by default, as for the rules.

import { en as EN, type RuleText } from "../../i18n/rules/en";
import { daysBetween, normalizeVin, parseIsoDate, toKm, vinTail } from "../normalize";
import { docLabel, docTypeOf, documentIntegrityIssue, isBatteryReport, notUsed, readDocs, readingDate, ref, usable, type RuleInput } from "../rules";
import type { CaseDocument, Claim, ClaimAssessmentInfo, DocumentType, EvidenceRef, FieldName, Finding, Odometer, Provenance, Status } from "../types";

export const ASSESSOR_VERSION = "2026.10.4";

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

export function claimLabel(c: Claim, t: RuleText = EN): string {
  const s = c.stated;
  const l = t.claim.label;
  switch (c.type) {
    case "battery_soh":
      return l.soh(s.number);
    case "odometer":
      return l.odometer(t.odo({ reading: s.number ?? 0, unit: s.unit === "mi" ? "mi" : "km" }));
    case "accident_history":
      return s.flag ? l.damage : l.noAccidents;
    case "fast_charging":
      return s.text ? l.chargingWords(s.text) : l.chargingMax(s.number);
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

function refDate(input: RuleInput) {
  const p = parseIsoDate(input.referenceDate.slice(0, 10));
  return p.ok ? p.date : new Date();
}

/** Who reported a figure: the provider or issuer named in the document, else the document. */
function sourceName(doc: CaseDocument, t: RuleText) {
  const issuer = usable(doc, "issuer");
  const provider = usable(doc, "batteryTestProvider");
  if (provider.state === "ok") return String(provider.value);
  if (issuer.state === "ok") return String(issuer.value);
  return docLabel(doc, t);
}

// ---------------------------------------------------------------- battery health

function assessSoh(claim: Claim, input: RuleInput, policy: ClaimPolicy, t: RuleText): Outcome {
  const s = t.claim.soh;
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
      evidence.push(ref(doc, "batterySohPercent", notUsed(soh.reason, t), t));
      continue;
    }
    const vin = usable(doc, "vin");
    const v = vin.state === "ok" ? normalizeVin(String(vin.value)) : null;
    const dateName = usable(doc, "batteryTestDate").state === "ok" ? "batteryTestDate" : "documentDate";
    const d = usable(doc, dateName);
    const parsed = d.state === "ok" ? parseIsoDate(String(d.value)) : null;
    const days = parsed && parsed.ok ? daysBetween(parsed.date, reference) : null;
    reps.push({ doc, soh: Number(soh.value), linked: !!v && !!caseVin && v === caseVin, otherVin: v && caseVin && v !== caseVin ? v : null, days, iso: parsed && parsed.ok ? parsed.iso : null });
    evidence.push(ref(doc, "batterySohPercent", undefined, t));
    if (vin.state !== "absent") evidence.push(ref(doc, "vin", vin.state === "excluded" ? notUsed(vin.reason, t) : undefined, t));
    if (d.state !== "absent") evidence.push(ref(doc, dateName, days !== null ? t.ev.daysBefore(days) : undefined, t));
  }

  const lower = reps.filter((r) => !r.otherVin && r.soh < claimed - policy.sohTolerancePts);
  if (lower.length) {
    const r = lower.sort((a, b) => a.soh - b.soh)[0];
    return {
      status: "conflict",
      headline: s.lowerHeadline(r.soh, Math.round((claimed - r.soh) * 10) / 10),
      result: s.lowerResult(sourceName(r.doc, t), r.soh, r.iso, claimed, policy.sohTolerancePts),
      evidence,
      nextAction: s.lowerNext,
      missing: null,
      decidedBy: r.doc,
    };
  }
  const confirming = reps.filter((r) => !r.otherVin && r.soh >= claimed - policy.sohTolerancePts);
  const wrong = reps.filter((r) => r.otherVin);
  if (!confirming.length && wrong.length) {
    return {
      status: "conflict",
      headline: s.otherVinHeadline(vinTail(wrong[0].otherVin!)),
      result: s.otherVinResult(vinTail(wrong[0].otherVin!), vinTail(caseVin), claimed),
      evidence,
      nextAction: s.otherVinNext,
      missing: null,
      decidedBy: wrong[0].doc,
    };
  }
  const verifiedBy = confirming.find((r) => r.linked && INDEPENDENT.includes(r.doc.provenance) && r.days !== null && r.days >= 0 && r.days <= policy.batteryReportMaxAgeDays && !documentIntegrityIssue(r.doc));
  if (verifiedBy) {
    return {
      status: "verified",
      headline: s.verifiedHeadline(verifiedBy.days, verifiedBy.soh),
      decidedBy: verifiedBy.doc,
      result: s.verifiedResult(sourceName(verifiedBy.doc, t), verifiedBy.soh, verifiedBy.iso, policy.batteryReportMaxAgeDays, policy.sohTolerancePts, claimed) + signedNote(verifiedBy.doc, t),
      evidence,
      nextAction: null,
      missing: null,
    };
  }
  if (confirming.length) {
    const r = confirming[0];
    const issue = documentIntegrityIssue(r.doc);
    const why = issue
      ? t.documentIssue[issue]
      : !r.linked
      ? s.why.noVin
      : !INDEPENDENT.includes(r.doc.provenance)
        ? s.why.seller
        : r.days === null
          ? s.why.noDate
          : s.why.old(r.days, policy.batteryReportMaxAgeDays);
    return {
      status: "consistent",
      headline: s.agreesHeadline(r.soh, why),
      decidedBy: r.doc,
      result: s.agreesResult(sourceName(r.doc, t), r.soh, claimed, why),
      evidence,
      nextAction: s.agreesNext,
      missing: null,
    };
  }
  return {
    status: "unknown",
    headline: s.noneHeadline,
    result: s.noneResult(claimed),
    evidence,
    nextAction: s.noneNext,
    missing: s.noneMissing(policy.batteryReportMaxAgeDays),
  };
}

// ---------------------------------------------------------------- mileage

function assessOdometer(claim: Claim, input: RuleInput, findings: Finding[], policy: ClaimPolicy, t: RuleText): Outcome {
  const s = t.claim.odometer;
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
      evidence.push(ref(doc, "odometer", notUsed(o.reason, t), t));
      continue;
    }
    const rd = readingDate(doc);
    const p = rd ? parseIsoDate(rd.value) : null;
    if (!p || !p.ok) {
      evidence.push(ref(doc, "odometer", t.ev.noDate, t));
      continue;
    }
    const odo = o.value as Odometer;
    readings.push({ doc, km: toKm(odo), odo, iso: p.iso, days: daysBetween(p.date, reference) });
    evidence.push(ref(doc, "odometer", t.ev.dated(p.iso), t));
  }
  readings.sort((a, b) => (a.iso < b.iso ? -1 : 1));

  const above = readings.filter((r) => r.km > claimKm + policy.odometerToleranceKm);
  if (above.length) {
    const r = above[above.length - 1];
    return {
      status: "conflict",
      headline: s.aboveHeadline(docTypeOf(r.doc) ?? "other", t.odo(r.odo), r.iso),
      result: s.aboveResult(docLabel(r.doc, t), t.odo(r.odo), r.iso, t.km(r.km - claimKm), t.odo(claimOdo)),
      evidence,
      nextAction: s.aboveNext,
      missing: null,
      decidedBy: r.doc,
    };
  }
  const fresh = readings.filter((r) => r.doc.provenance === "dealer_captured" && r.days >= 0 && r.days <= policy.odometerFreshDays && !documentIntegrityIssue(r.doc));
  const freshMismatch = fresh.find((r) => Math.abs(r.km - claimKm) > policy.odometerToleranceKm);
  if (freshMismatch) {
    return {
      status: "conflict",
      headline: s.dashboardHeadline(t.odo(freshMismatch.odo), freshMismatch.iso),
      result: s.dashboardResult(t.odo(freshMismatch.odo), freshMismatch.iso, t.odo(claimOdo), t.km(Math.abs(freshMismatch.km - claimKm))),
      evidence,
      nextAction: s.dashboardNext,
      missing: null,
      decidedBy: freshMismatch.doc,
    };
  }
  const timeline = findings.find((f) => f.id === "mileage-timeline");
  if (timeline?.status === "conflict") {
    return {
      status: "conflict",
      headline: s.timelineHeadline,
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
      headline: s.verifiedHeadline(r.iso),
      decidedBy: r.doc,
      result: s.verifiedResult(r.iso, t.odo(r.odo), t.km(policy.odometerToleranceKm), t.odo(claimOdo)),
      evidence,
      nextAction: null,
      missing: null,
    };
  }
  if (readings.length) {
    const latest = readings[readings.length - 1];
    const kinds = Array.from(new Set(readings.map((r) => docTypeOf(r.doc)).filter((x): x is DocumentType => !!x)));
    return {
      status: "consistent",
      headline: s.inLineHeadline(kinds),
      decidedBy: latest.doc,
      result: s.inLineResult(readings.length, t.odo(latest.odo), latest.iso, t.odo(claimOdo)),
      evidence,
      nextAction: s.inLineNext,
      missing: null,
    };
  }
  return {
    status: "unknown",
    headline: s.noneHeadline,
    result: s.noneResult(t.odo(claimOdo)),
    evidence,
    nextAction: s.noneNext,
    missing: s.noneMissing,
  };
}

// ---------------------------------------------------------------- accident history

const HISTORY_TYPES: DocumentType[] = ["service_invoice", "insurance_or_repair_record", "purchase_invoice"];

function assessAccident(claim: Claim, input: RuleInput, policy: ClaimPolicy, t: RuleText): Outcome {
  const s = t.claim.accident;
  const evidence: EvidenceRef[] = [];
  const repairs: { doc: CaseDocument; text: string; iso: string | null }[] = [];
  const history: { doc: CaseDocument; iso: string }[] = [];
  for (const doc of readDocs(input.documents)) {
    const r = usable(doc, "damageRepair");
    const d = usable(doc, "documentDate");
    const p = d.state === "ok" ? parseIsoDate(String(d.value)) : null;
    const iso = p && p.ok ? p.iso : null;
    if (r.state === "excluded") evidence.push(ref(doc, "damageRepair", notUsed(r.reason, t), t));
    if (r.state === "ok") {
      repairs.push({ doc, text: String(r.value), iso });
      evidence.push(ref(doc, "damageRepair", iso ? t.ev.dated(iso) : undefined, t));
    } else if (iso && HISTORY_TYPES.includes(docTypeOf(doc) ?? "other")) {
      history.push({ doc, iso });
      const sd = usable(doc, "serviceDetails");
      evidence.push(sd.state === "ok" ? ref(doc, "serviceDetails", t.ev.noDamage, t) : ref(doc, "documentDate", t.ev.noDamage, t));
    }
  }

  if (claim.stated.flag === true) {
    if (repairs.length) {
      return {
        status: "consistent",
        headline: s.disclosedHeadline(repairs[0].text),
        decidedBy: repairs[0].doc,
        result: s.disclosedResult(docLabel(repairs[0].doc, t), repairs[0].text),
        evidence,
        nextAction: s.disclosedNext,
        missing: null,
      };
    }
    return {
      status: "unknown",
      headline: s.noRecordHeadline,
      result: s.noRecordResult,
      evidence,
      nextAction: s.noRecordNext,
      missing: s.noRecordMissing,
    };
  }

  if (repairs.length) {
    const r = repairs[0];
    return {
      status: "conflict",
      headline: s.repairHeadline(docTypeOf(r.doc) ?? "other", repairs.length),
      result: s.repairResult(docLabel(r.doc, t), r.iso, r.text),
      evidence,
      nextAction: s.repairNext,
      missing: null,
      decidedBy: r.doc,
    };
  }
  const dates = history.map((h) => h.iso).sort();
  const months = dates.length >= 2 ? Math.floor(daysBetween(new Date(dates[0]), new Date(dates[dates.length - 1])) / 30.44) : 0;
  if (history.length >= 2 && months >= policy.accidentHistoryMinMonths) {
    return {
      status: "consistent",
      headline: s.cleanHeadline(history.length, months),
      result: s.cleanResult(history.length, dates[0], dates[dates.length - 1]),
      evidence,
      nextAction: s.cleanNext,
      missing: null,
    };
  }
  return {
    status: "unknown",
    headline: s.noneHeadline,
    result: s.noneResult(policy.accidentHistoryMinMonths),
    evidence,
    nextAction: s.noneNext,
    missing: s.noneMissing,
  };
}

// ---------------------------------------------------------------- fast charging

function assessCharging(claim: Claim, input: RuleInput, policy: ClaimPolicy, t: RuleText): Outcome {
  const s = t.claim.charging;
  const max = claim.stated.number ?? 30;
  const evidence: EvidenceRef[] = [];
  const logs: { doc: CaseDocument; share: number }[] = [];
  for (const doc of readDocs(input.documents)) {
    const u = usable(doc, "dcChargingSharePercent");
    if (u.state === "absent") continue;
    if (u.state === "excluded") {
      evidence.push(ref(doc, "dcChargingSharePercent", notUsed(u.reason, t), t));
      continue;
    }
    logs.push({ doc, share: Number(u.value) });
    evidence.push(ref(doc, "dcChargingSharePercent", undefined, t));
  }
  const over = logs.filter((l) => l.share > max + policy.chargingTolerancePts);
  if (over.length) {
    const l = over[0];
    return {
      status: "conflict",
      headline: s.overHeadline(l.share),
      decidedBy: l.doc,
      result: s.overResult(docLabel(l.doc, t), l.share, max),
      evidence,
      nextAction: s.overNext,
      missing: null,
    };
  }
  const indep = logs.find((l) => INDEPENDENT.includes(l.doc.provenance) && !documentIntegrityIssue(l.doc));
  if (indep) {
    return {
      status: "verified",
      headline: s.verifiedHeadline(indep.share),
      decidedBy: indep.doc,
      result: s.verifiedResult(docLabel(indep.doc, t), indep.share, max),
      evidence,
      nextAction: null,
      missing: null,
    };
  }
  if (logs.length) {
    return {
      status: "consistent",
      headline: s.sellerHeadline(logs[0].share),
      decidedBy: logs[0].doc,
      result: s.sellerResult(docLabel(logs[0].doc, t), logs[0].share),
      evidence,
      nextAction: s.sellerNext,
      missing: null,
    };
  }
  return {
    status: "unknown",
    headline: s.noneHeadline,
    result: s.noneResult,
    evidence,
    nextAction: s.noneNext,
    missing: s.noneMissing,
  };
}

function signedNote(doc: CaseDocument, t: RuleText) {
  const s = doc.forensics?.signatures.find((x) => x.integrity === "valid" && x.trustedAs && x.coversWholeFile);
  return s ? t.claim.soh.signed(s.trustedAs!) : "";
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
  // The battery report itself shows signs of editing, even if no figure could be read from it.
  if (claim.type === "battery_soh") {
    for (const doc of readDocs(input.documents).filter(isBatteryReport)) {
      const flag = (doc.forensics?.indicators ?? []).find((i) => i.severity === "potential" && (i.code === "text_overlaps_text" || i.code === "signature_broken"));
      const field = doc.extraction?.fields.batterySohPercent;
      if (flag && !field?.tamperIndicator) return { doc, field: "batterySohPercent" as FieldName, message: flag.message };
    }
  }
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

export function assessClaim(claim: Claim, input: RuleInput, findings: Finding[], policy: ClaimPolicy = DEFAULT_POLICY, t: RuleText = EN): Finding {
  const tampered = tamperedEvidence(claim, input);
  // The forensic check's own message describes the file and quotes it, so it is kept as written.
  const o: Outcome = tampered
    ? {
        status: "conflict",
        headline: t.claim.tampered.headline(t.claim.short(tampered.field), tampered.doc.filename),
        result: t.claim.tampered.result(tampered.message),
        evidence: [ref(tampered.doc, tampered.field, t.ev.possibleEdit, t)],
        nextAction: t.claim.tampered.next,
        missing: null,
        decidedBy: tampered.doc,
      }
    :
    claim.type === "battery_soh"
      ? assessSoh(claim, input, policy, t)
      : claim.type === "odometer"
        ? assessOdometer(claim, input, findings, policy, t)
        : claim.type === "accident_history"
          ? assessAccident(claim, input, policy, t)
          : assessCharging(claim, input, policy, t);
  const label = claimLabel(claim, t);
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
    checked: t.claim.checked(claim.type, claim.sourceText),
    evidence: o.evidence,
    status: o.status,
    result: o.result,
    whyItMatters: t.claim.why[claim.type],
    nextAction: o.nextAction,
    decisionImpact: o.status === "conflict" || o.status === "unknown",
    requiresReview: o.status === "conflict",
    claim: info,
  };
}

export function assessClaims(claims: Claim[] | undefined, input: RuleInput, findings: Finding[], policy: ClaimPolicy = DEFAULT_POLICY, t: RuleText = EN): Finding[] {
  return activeClaims(claims).map((c) => assessClaim(c, input, findings, policy, t));
}

/** "1 conflict to review before you pay. 2 claims backed by evidence, 1 still missing." */
export function claimSummaryLine(assessments: Finding[], t: RuleText = EN): string | null {
  if (!assessments.length) return null;
  const n = (s: Status) => assessments.filter((a) => a.status === s).length;
  return t.claim.summary(n("conflict"), n("verified") + n("consistent"), n("unknown"));
}
