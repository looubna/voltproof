// Builds the case report: the same structure feeds the printable page and
// the JSON export, so both carry identical source references.
//
// The JSON export is machine-readable and stays in English, the language of the record.
// The printable page passes the reader's language and a finding view (src/lib/localize.ts),
// which re-words the same findings; every status and decision still comes from the record.
import type { Locale } from "../i18n/config";
import { format } from "../i18n/format";
import { MESSAGES } from "../i18n/messages/catalog";
import type { Messages } from "../i18n/messages/en";
import { RULE_TEXT } from "../i18n/rules";
import { currentFindings, decisionImpactItems, latestRun, reviewState } from "./derive";
import { ASSESSOR_VERSION, claimSummaryLine } from "./claims/assess";
import { titleTranslator, type FindingView, type ShownEvidence } from "./localize";
import type { Case, EvidenceRef, FieldName, Finding, Odometer, Status } from "./types";

/** Questions for the seller, by claim type and status. Fixed wording: no model writes these. */
export function claimQuestions(claims: Finding[], questions: Messages["report"]["sellerQuestions"] = MESSAGES.en.report.sellerQuestions, label: (f: Finding) => string = (f) => f.claim!.label) {
  return claims
    .filter((f) => f.claim && (f.status === "conflict" || f.status === "unknown"))
    .sort((a, b) => (a.status === "conflict" ? 0 : 1) - (b.status === "conflict" ? 0 : 1))
    .map((f) => ({ claimId: f.claim!.claimId, claim: label(f), status: f.status, question: (questions[f.claim!.type] as Partial<Record<Status, string>>)[f.status]! }));
}

const authenticity = (m: Messages) => `${m.report.authenticity.title} ${m.report.authenticity.body}`;

export const AUTHENTICITY_STATEMENT = authenticity(MESSAGES.en);

const KEY_FIELDS: FieldName[] = ["documentType", "documentDate", "vin", "make", "model", "odometer", "batteryTestDate", "batterySohPercent", "batteryTestProvider", "serviceDetails", "damageRepair", "dcChargingSharePercent"];

/** The language a shown finding is in (absent for the stored record, so the JSON export is unchanged). */
const langOf = (f: object) => ("lang" in f ? (f.lang as Locale) : undefined);

/** A value "Not used" by the checks, judged from the stored English note so it holds in every language. */
const excluded = (stored: EvidenceRef) => (stored.note ?? "").startsWith("Not used");

export function buildReport(c: Case, generatedBy: string, opts: { locale?: Locale; view?: FindingView } = {}) {
  const locale = opts.locale ?? "en";
  const m = MESSAGES[locale];
  const rules = RULE_TEXT[locale];
  // Without a view (the JSON export) the stored findings are used exactly as recorded.
  const view: (f: Finding) => Finding | (Omit<Finding, "evidence"> & { evidence: ShownEvidence[] }) = opts.view ?? ((f) => f);
  const title = opts.view ? titleTranslator(c, opts.view) : (x: string) => x;
  const run = latestRun(c);
  const all = currentFindings(c);
  const claimFindings = all.filter((f) => f.claim);
  const findings = all.filter((f) => !f.claim);
  const impact = decisionImpactItems(c);

  const show = (v: unknown) => {
    if (v && typeof v === "object" && "reading" in v) return rules.odo(v as Odometer);
    if (typeof v === "string" && v in m.labels.docType) return m.labels.docType[v as keyof Messages["labels"]["docType"]];
    return String(v);
  };

  const documents = c.documents.map((d) => ({
    id: d.id,
    filename: d.filename,
    type: d.extraction?.fields.documentType.value ? m.labels.docType[d.extraction.fields.documentType.value] : m.report.documents.notDetermined,
    provenance: m.labels.provenance[d.provenance],
    uploadedBy: d.uploadedBy,
    uploadedAt: d.uploadedAt,
    sha256: d.integrity.sha256,
    extractionStatus: d.extractionStatus,
    extractionMode: d.extraction?.mode ?? null,
    extractionModel: d.extraction?.model ?? null,
    // The file checks' own messages, as written.
    integrityIndicators: d.integrity.indicators.filter((i) => i.severity === "potential").map((i) => i.message),
  }));

  const keyFacts: EvidenceRef[] = c.documents.flatMap((d) =>
    KEY_FIELDS.flatMap((k) => {
      const f = d.extraction?.fields[k];
      if (!f || f.value === null) return [];
      return [{
        documentId: d.id,
        documentName: d.filename,
        field: m.labels.field[k],
        value: show(f.value),
        page: f.page,
        quote: f.quote,
        confidence: f.confidence,
        note: f.supported ? undefined : format(m.report.notUsedByChecks, { reason: rules.reason(f.unsupportedReason ?? "") }),
      }];
    }),
  );

  const statusCounts = findings.reduce<Record<Status, number>>((a, f) => ((a[f.status] += 1), a), { verified: 0, consistent: 0, conflict: 0, unknown: 0 });

  const checks = findings
    .filter((f) => f.id !== "authenticity")
    .map((f) => {
      const rs = reviewState(c, f);
      const s = view(f);
      return {
        id: f.id,
        title: s.title,
        status: f.status,
        lang: langOf(s),
        checked: s.checked,
        result: s.result,
        whyItMatters: s.whyItMatters,
        nextAction: s.nextAction,
        evidence: s.evidence,
        humanReview: rs.latest
          ? { resolution: m.labels.resolution[rs.latest.resolution], note: rs.latest.note, reviewer: rs.latest.reviewer, at: rs.latest.at, stale: rs.stale }
          : null,
      };
    });

  const unresolved = impact.open.map(({ finding }) => {
    const s = view(finding);
    return { id: finding.id, title: s.title, status: finding.status, lang: langOf(s), result: s.result, nextAction: s.nextAction };
  });
  const nextSteps = Array.from(new Set(impact.open.map((i) => view(i.finding).nextAction).filter((x): x is string => !!x)));

  const reviewerNotes = c.reviews.map((r) => ({
    finding: title(r.findingSnapshot.title),
    machineStatus: r.findingSnapshot.status,
    resolution: m.labels.resolution[r.resolution],
    note: r.note,
    reviewer: r.reviewer,
    at: r.at,
  }));

  const modes = new Set(c.documents.map((d) => d.extraction?.mode).filter(Boolean));

  const claims = claimFindings.map((f) => {
    const rs = reviewState(c, f);
    const s = view(f);
    return {
      claimId: f.claim!.claimId,
      type: f.claim!.type,
      topic: m.labels.claimType[f.claim!.type],
      label: s.claim!.label,
      status: f.status,
      lang: langOf(s),
      headline: s.claim!.headline,
      result: s.result,
      missing: s.claim!.missing,
      nextAction: s.nextAction,
      // Every status links to its sources: only values actually used, each with page and quote.
      sources: s.evidence.filter((e, i) => e.documentId && !excluded(f.evidence[i])),
      humanReview: rs.latest ? { resolution: m.labels.resolution[rs.latest.resolution], note: rs.latest.note, reviewer: rs.latest.reviewer, at: rs.latest.at, stale: rs.stale } : null,
    };
  });
  const models = Array.from(new Set(c.documents.map((d) => d.extraction?.model).filter((x): x is string => !!x)));

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
    claimSummary: claimSummaryLine(claimFindings, rules),
    claims,
    questions: claimQuestions(claimFindings, m.report.sellerQuestions, (f) => view(f).claim!.label),
    documents,
    keyFacts,
    statusCounts,
    checks,
    unresolved,
    nextSteps,
    reviewerNotes,
    authenticityStatement: authenticity(m),
  };
}

export type CaseReport = ReturnType<typeof buildReport>;
