// Builds the case report: the same structure feeds the printable page and
// the JSON export, so both carry identical source references.
import { DOC_TYPE_LABEL, FIELD_LABEL, PROVENANCE_LABEL, RESOLUTION_LABEL } from "./labels";
import { currentFindings, decisionImpactItems, latestRun, reviewState } from "./derive";
import { formatOdometer } from "./normalize";
import { ASSESSOR_VERSION, claimSummaryLine } from "./claims/assess";
import { CLAIM_TYPE_LABEL } from "./labels";
import type { Case, ClaimType, EvidenceRef, FieldName, Finding, Odometer, Status } from "./types";

/** Questions for the seller, by claim type and status. Fixed wording: no model writes these. */
const CLAIM_QUESTIONS: Record<ClaimType, Partial<Record<Status, string>>> = {
  battery_soh: {
    conflict: "Where does the battery figure in the listing come from, and why does the test report show a different figure?",
    unknown: "Can you share a recent battery health report for this VIN, or let us arrange an independent test?",
  },
  odometer: {
    conflict: "Why do the records show a different mileage from the listing? Has the instrument cluster ever been replaced?",
    unknown: "Can we photograph the odometer and see dated service invoices?",
  },
  accident_history: {
    conflict: "Can you explain the repair in the insurance or repair record, and share the repair invoice?",
    unknown: "Can you share the insurance claims history for this VIN?",
  },
  fast_charging: {
    conflict: "How was the car usually charged? The charging log shows more fast charging than the listing says.",
    unknown: "Can you export the charging history from the car's app?",
  },
};

export function claimQuestions(claims: Finding[]) {
  return claims
    .filter((f) => f.claim && (f.status === "conflict" || f.status === "unknown"))
    .sort((a, b) => (a.status === "conflict" ? 0 : 1) - (b.status === "conflict" ? 0 : 1))
    .map((f) => ({ claimId: f.claim!.claimId, claim: f.claim!.label, status: f.status, question: CLAIM_QUESTIONS[f.claim!.type][f.status]! }));
}

export const AUTHENTICITY_STATEMENT =
  "Authenticity not verified. VoltProof has not confirmed any document with its issuer or with an authoritative registry. " +
  "Matching values, successful AI extraction, clean file checks and SHA-256 fingerprints show only that the documents agree with each other " +
  "and that files have not changed since upload. They do not prove that any document is genuine. This report is an evidence summary, " +
  "not a vehicle valuation, a battery certification or a fraud determination.";

const KEY_FIELDS: FieldName[] = ["documentType", "documentDate", "vin", "make", "model", "odometer", "batteryTestDate", "batterySohPercent", "batteryTestProvider", "serviceDetails", "damageRepair", "dcChargingSharePercent"];

function show(v: unknown) {
  if (v && typeof v === "object" && "reading" in v) return formatOdometer(v as Odometer);
  if (typeof v === "string" && v in DOC_TYPE_LABEL) return DOC_TYPE_LABEL[v as keyof typeof DOC_TYPE_LABEL];
  return String(v);
}

export function buildReport(c: Case, generatedBy: string) {
  const run = latestRun(c);
  const all = currentFindings(c);
  const claimFindings = all.filter((f) => f.claim);
  const findings = all.filter((f) => !f.claim);
  const impact = decisionImpactItems(c);

  const documents = c.documents.map((d) => ({
    id: d.id,
    filename: d.filename,
    type: d.extraction?.fields.documentType.value ? DOC_TYPE_LABEL[d.extraction.fields.documentType.value] : "Not determined",
    provenance: PROVENANCE_LABEL[d.provenance],
    uploadedBy: d.uploadedBy,
    uploadedAt: d.uploadedAt,
    sha256: d.integrity.sha256,
    extractionStatus: d.extractionStatus,
    extractionMode: d.extraction?.mode ?? null,
    extractionModel: d.extraction?.model ?? null,
    integrityIndicators: d.integrity.indicators.filter((i) => i.severity === "potential").map((i) => i.message),
  }));

  const keyFacts: EvidenceRef[] = c.documents.flatMap((d) =>
    KEY_FIELDS.flatMap((k) => {
      const f = d.extraction?.fields[k];
      if (!f || f.value === null) return [];
      return [{
        documentId: d.id,
        documentName: d.filename,
        field: FIELD_LABEL[k],
        value: show(f.value),
        page: f.page,
        quote: f.quote,
        confidence: f.confidence,
        note: f.supported ? undefined : `Not used by checks: ${f.unsupportedReason}`,
      }];
    }),
  );

  const statusCounts = findings.reduce<Record<Status, number>>((a, f) => ((a[f.status] += 1), a), { verified: 0, consistent: 0, conflict: 0, unknown: 0 });

  const checks = findings
    .filter((f) => f.id !== "authenticity")
    .map((f) => {
      const rs = reviewState(c, f);
      return {
        id: f.id,
        title: f.title,
        status: f.status,
        checked: f.checked,
        result: f.result,
        whyItMatters: f.whyItMatters,
        nextAction: f.nextAction,
        evidence: f.evidence,
        humanReview: rs.latest
          ? { resolution: RESOLUTION_LABEL[rs.latest.resolution], note: rs.latest.note, reviewer: rs.latest.reviewer, at: rs.latest.at, stale: rs.stale }
          : null,
      };
    });

  const unresolved = impact.open.map(({ finding }) => ({ id: finding.id, title: finding.title, status: finding.status, result: finding.result, nextAction: finding.nextAction }));
  const nextSteps = Array.from(new Set(impact.open.map((i) => i.finding.nextAction).filter((x): x is string => !!x)));

  const reviewerNotes = c.reviews.map((r) => ({
    finding: r.findingSnapshot.title,
    machineStatus: r.findingSnapshot.status,
    resolution: RESOLUTION_LABEL[r.resolution],
    note: r.note,
    reviewer: r.reviewer,
    at: r.at,
  }));

  const modes = new Set(c.documents.map((d) => d.extraction?.mode).filter(Boolean));

  const claims = claimFindings.map((f) => {
    const rs = reviewState(c, f);
    return {
      claimId: f.claim!.claimId,
      type: f.claim!.type,
      topic: CLAIM_TYPE_LABEL[f.claim!.type],
      label: f.claim!.label,
      status: f.status,
      headline: f.claim!.headline,
      result: f.result,
      missing: f.claim!.missing,
      nextAction: f.nextAction,
      // Every status links to its sources: only values actually used, each with page and quote.
      sources: f.evidence.filter((e) => e.documentId && !(e.note ?? "").startsWith("Not used")),
      humanReview: rs.latest ? { resolution: RESOLUTION_LABEL[rs.latest.resolution], note: rs.latest.note, reviewer: rs.latest.reviewer, at: rs.latest.at, stale: rs.stale } : null,
    };
  });
  const models = Array.from(new Set(c.documents.map((d) => d.extraction?.model).filter((m): m is string => !!m)));

  return {
    reportVersion: 2,
    generatedAt: new Date().toISOString(),
    generatedBy,
    synthetic: c.synthetic,
    case: { id: c.id, caseNumber: c.caseNumber, createdAt: c.createdAt, createdBy: c.createdBy },
    vehicle: c.vehicle,
    rules: run ? { version: run.rulesVersion, assessorVersion: run.assessorVersion ?? ASSESSOR_VERSION, ranAt: run.at } : null,
    extractionModes: Array.from(modes),
    models,
    claimSummary: claimSummaryLine(claimFindings),
    claims,
    questions: claimQuestions(claimFindings),
    documents,
    keyFacts,
    statusCounts,
    checks,
    unresolved,
    nextSteps,
    reviewerNotes,
    authenticityStatement: AUTHENTICITY_STATEMENT,
  };
}

export type CaseReport = ReturnType<typeof buildReport>;
