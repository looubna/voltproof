import Link from "next/link";
import type { ReactNode } from "react";
import { RESOLUTION_LABEL, STATUS_LABEL, STATUS_MEANING } from "@/lib/labels";
import type { ReviewState } from "@/lib/derive";
import type { EvidenceRef, Finding, Status } from "@/lib/types";

const STATUS_CLASS: Record<Status, string> = {
  verified: "bg-verified-bg text-verified-fg",
  consistent: "bg-consistent-bg text-consistent-fg",
  conflict: "bg-conflict-bg text-conflict-fg ring-1 ring-conflict-dot/40",
  unknown: "bg-unknown-bg text-unknown-fg",
};
const DOT_CLASS: Record<Status, string> = {
  verified: "bg-verified-dot",
  consistent: "bg-consistent-dot",
  conflict: "bg-conflict-dot",
  unknown: "bg-unknown-dot",
};

export function StatusBadge({ status, detail, size = "md" }: { status: Status; detail?: string; size?: "sm" | "md" }) {
  return (
    <span
      title={STATUS_MEANING[status]}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-semibold ${STATUS_CLASS[status]} ${size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs"}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${DOT_CLASS[status]}`} aria-hidden />
      {STATUS_LABEL[status]}
      {detail ? <span className="font-normal opacity-80">· {detail}</span> : null}
    </span>
  );
}

export function SyntheticBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800" title="Fictional demonstration data">
      Synthetic data
    </span>
  );
}

export function StatusLegend() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {(["verified", "consistent", "conflict", "unknown"] as Status[]).map((s) => (
        <div key={s} className="card p-3">
          <StatusBadge status={s} size="sm" />
          <p className="mt-1.5 text-xs leading-relaxed text-muted">{STATUS_MEANING[s]}</p>
        </div>
      ))}
    </div>
  );
}

export function PageTitle({ eyebrow, title, children, actions }: { eyebrow?: ReactNode; title: ReactNode; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow ? <div className="label mb-1 flex items-center gap-2">{eyebrow}</div> : null}
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {children ? <div className="mt-1 text-sm text-muted">{children}</div> : null}
      </div>
      {actions ? <div className="no-print flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-[#fdfcfa] px-6 py-10 text-center">
      <p className="font-medium text-ink">{title}</p>
      {children ? <div className="mt-1 text-sm text-muted">{children}</div> : null}
    </div>
  );
}

export function docHref(caseId: string, e: { documentId: string | null; page: number | null; quote: string | null }) {
  if (!e.documentId) return null;
  const q = new URLSearchParams();
  if (e.page) q.set("page", String(e.page));
  if (e.quote) q.set("quote", e.quote);
  return `/cases/${caseId}/documents/${e.documentId}${q.size ? `?${q}` : ""}`;
}

export function EvidenceTable({ caseId, evidence, compact }: { caseId: string; evidence: EvidenceRef[]; compact?: boolean }) {
  if (!evidence.length) return <p className="text-sm text-muted">No evidence available.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-line text-xs text-muted">
            <th className="py-1.5 pr-3 font-medium">Source</th>
            <th className="py-1.5 pr-3 font-medium">Field</th>
            <th className="py-1.5 pr-3 font-medium">Value</th>
            {!compact && <th className="py-1.5 pr-3 font-medium">Page · supporting quote</th>}
          </tr>
        </thead>
        <tbody>
          {evidence.map((e, i) => {
            const href = docHref(caseId, e);
            return (
              <tr key={i} className="border-b border-line/70 align-top last:border-0">
                <td className="py-2 pr-3">
                  {href ? (
                    <Link href={href} className="link break-all">
                      {e.documentName}
                    </Link>
                  ) : (
                    <span className="text-muted">{e.documentName}</span>
                  )}
                </td>
                <td className="py-2 pr-3 whitespace-nowrap text-muted">{e.field}</td>
                <td className="py-2 pr-3 font-mono text-[13px]">
                  {e.value}
                  {e.note ? <div className={`mt-0.5 font-sans text-xs ${/^(Not |Invalid|Date is in the future|Earlier than)/.test(e.note) ? "text-conflict-fg" : "text-muted"}`}>{e.note}</div> : null}
                </td>
                {!compact && (
                  <td className="py-2 pr-3 text-xs text-muted">
                    {e.page ? <span className="mr-1 font-medium text-ink">p.{e.page}</span> : null}
                    {e.quote ? <q className="italic">{e.quote}</q> : e.documentId ? "—" : null}
                    {e.confidence !== null ? <span className="ml-1 whitespace-nowrap">· conf. {e.confidence.toFixed(2)}</span> : null}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function ReviewStamp({ state }: { state: ReviewState }) {
  if (!state.latest) return null;
  const r = state.latest;
  const tone = state.stale ? "border-amber-300 bg-amber-50" : r.resolution === "resolved" ? "border-verified-dot/30 bg-verified-bg/60" : "border-line bg-brand-50";
  return (
    <div className={`rounded-lg border px-3 py-2 text-sm ${tone}`}>
      <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
        <span className="font-semibold text-ink">Human review: {RESOLUTION_LABEL[r.resolution]}</span>
        <span>by {r.reviewer}</span>
        <span>· {new Date(r.at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</span>
      </div>
      <p className="mt-1 text-ink">{r.note}</p>
      {state.stale ? <p className="mt-1 text-xs font-medium text-amber-800">The evidence changed after this review, so the item is open again.</p> : null}
    </div>
  );
}

export function FindingCard({ caseId, finding, review, children }: { caseId: string; finding: Finding; review?: ReviewState; children?: ReactNode }) {
  return (
    <article className="card p-5" id={finding.id}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-ink">{finding.title}</h3>
        <StatusBadge status={finding.status} detail={finding.status === "conflict" ? (review?.open === false ? "reviewed" : "needs review") : undefined} />
      </header>
      <dl className="mt-3 grid gap-3 text-sm">
        <div>
          <dt className="label">What was checked</dt>
          <dd className="mt-0.5 text-ink">{finding.checked}</dd>
        </div>
        <div>
          <dt className="label">Result</dt>
          <dd className="mt-0.5 text-ink">{finding.result}</dd>
        </div>
        <div>
          <dt className="label">Evidence used</dt>
          <dd className="mt-1">
            <EvidenceTable caseId={caseId} evidence={finding.evidence} />
          </dd>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="label">Why it matters</dt>
            <dd className="mt-0.5 text-ink">{finding.whyItMatters}</dd>
          </div>
          <div>
            <dt className="label">Recommended next action</dt>
            <dd className="mt-0.5 text-ink">{finding.nextAction ?? "None required."}</dd>
          </div>
        </div>
      </dl>
      {review?.latest ? (
        <div className="mt-4">
          <ReviewStamp state={review} />
        </div>
      ) : null}
      {children ? <div className="mt-4">{children}</div> : null}
    </article>
  );
}

export function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}
