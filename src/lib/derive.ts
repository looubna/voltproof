// Pure helpers that derive views from a case. Safe for client and server.
import type { Case, Finding, Review, RuleRun } from "./types";

export function latestRun(c: Case): RuleRun | null {
  return c.ruleRuns.length ? c.ruleRuns[c.ruleRuns.length - 1] : null;
}

export function currentFindings(c: Case): Finding[] {
  return latestRun(c)?.findings ?? [];
}

export function reviewsFor(c: Case, findingId: string): Review[] {
  return c.reviews.filter((r) => r.findingId === findingId);
}

/** Compact identity of the evidence behind a finding, used to detect changes after a review. */
export function evidenceKey(f: Finding): string {
  return f.evidence.map((e) => `${e.documentId ?? "case"}:${e.field}=${e.value}${e.note ? "*" : ""}`).sort().join("|");
}

export interface ReviewState {
  latest: Review | null;
  /** The finding's machine result changed after the latest review was recorded. */
  stale: boolean;
  /** Needs a person: unresolved, more info requested, never reviewed, or stale. */
  open: boolean;
}

export function reviewState(c: Case, f: Finding): ReviewState {
  const rs = reviewsFor(c, f.id);
  const latest = rs.length ? rs[rs.length - 1] : null;
  const snap = latest?.findingSnapshot;
  const stale = !!snap && (snap.result !== f.result || snap.status !== f.status || (snap.evidenceKey !== undefined && snap.evidenceKey !== evidenceKey(f)));
  const needsAttention = f.status === "conflict" || f.status === "unknown";
  const open = needsAttention && (f.requiresReview || f.decisionImpact) && (!latest || stale || latest.resolution !== "resolved");
  return { latest, stale, open };
}

export function decisionImpactItems(c: Case) {
  const items = currentFindings(c)
    .filter((f) => f.decisionImpact && (f.status === "conflict" || f.status === "unknown"))
    .map((f) => ({ finding: f, review: reviewState(c, f) }));
  const rank = (s: string) => (s === "conflict" ? 0 : 1);
  return {
    open: items.filter((i) => i.review.open).sort((a, b) => rank(a.finding.status) - rank(b.finding.status)),
    resolved: items.filter((i) => !i.review.open),
  };
}

export function reviewQueue(c: Case) {
  // Before any document is uploaded, Unknown only means "nothing uploaded yet": not something for a
  // person to decide. A Conflict (e.g. a typed VIN that names another maker) still needs review.
  const noDocuments = c.documents.length === 0;
  return currentFindings(c)
    .filter((f) => f.requiresReview && (f.status === "conflict" || (f.status === "unknown" && !noDocuments)))
    .map((f) => ({ finding: f, review: reviewState(c, f) }));
}

export type CaseStage = "processing" | "awaiting_review" | "review_complete" | "no_documents";

export function caseSummary(c: Case) {
  const findings = currentFindings(c);
  const processing = c.documents.some((d) => d.extractionStatus === "pending" || d.extractionStatus === "processing");
  const queue = reviewQueue(c);
  const openQueue = queue.filter((q) => q.review.open);
  const openConflicts = findings.filter((f) => f.status === "conflict" && reviewState(c, f).open).length;
  // With no documents everything is missing; the stage ("No documents yet") already says so.
  const missingEvidence = c.documents.length === 0 ? 0 : findings.filter((f) => f.status === "unknown" && f.decisionImpact && reviewState(c, f).open).length;
  const stage: CaseStage = c.documents.length === 0 ? "no_documents" : processing ? "processing" : openQueue.length ? "awaiting_review" : "review_complete";
  return { stage, openConflicts, missingEvidence, openReviewItems: openQueue.length, totalReviewItems: queue.length };
}

export const STAGE_LABEL: Record<CaseStage, string> = {
  processing: "Processing",
  awaiting_review: "Awaiting review",
  review_complete: "Review complete",
  no_documents: "No documents yet",
};
