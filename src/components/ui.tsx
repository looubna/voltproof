// Shared building blocks for the app's pages. Server components: each reads the request's
// language itself (getI18n is cached per request), so pages do not pass translations down.
import Link from "next/link";
import { DateTime, formatUtc } from "./date-time";
import type { ReactNode } from "react";
import { format } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import type { ReviewState } from "@/lib/derive";
import type { ShownEvidence, ShownFinding } from "@/lib/localize";
import type { EvidenceRef, Status } from "@/lib/types";

export { DateTime };

const STATUSES: Status[] = ["verified", "consistent", "conflict", "unknown"];

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

/** A status as a coloured pill, named in the page's language (or `label`/`meaning` when given). */
export async function StatusBadge({ status, detail, size = "md", label, meaning }: { status: Status; detail?: string; size?: "sm" | "md"; label?: string; meaning?: string }) {
  const { m } = await getI18n();
  return (
    <span
      title={meaning ?? m.statusMeaning[status]}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-semibold ${STATUS_CLASS[status]} ${size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs"}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${DOT_CLASS[status]}`} aria-hidden />
      {label ?? m.status[status]}
      {detail ? <span className="font-normal opacity-80">· {detail}</span> : null}
    </span>
  );
}

export async function SyntheticBadge({ label }: { label?: string }) {
  const { m } = await getI18n();
  return <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">{label ?? m.demoData}</span>;
}

/** The four statuses with their full meaning (evidence page, "How it works"). */
export async function StatusLegend() {
  const { m } = await getI18n();
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {STATUSES.map((s) => (
        <div key={s} className="card p-3">
          <StatusBadge status={s} size="sm" />
          <p className="mt-1.5 text-xs leading-relaxed text-muted">{m.statusDetail[s]}</p>
        </div>
      ))}
    </div>
  );
}

/** The four statuses with a line each, always on screen: a badge's hover title does not show on phones. */
export async function StatusKey({ className = "" }: { className?: string }) {
  const { m } = await getI18n();
  const title = m.dashboard.legend;
  return (
    <aside aria-label={title} className={`rounded-xl border border-line bg-[#fdfcfa] px-4 py-3 ${className}`}>
      <p className="label mb-2">{title}</p>
      <dl className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {STATUSES.map((s) => (
          <div key={s} className="grid content-start gap-1">
            <dt>
              <StatusBadge status={s} size="sm" />
            </dt>
            <dd className="text-xs text-muted">{m.statusMeaning[s]}</dd>
          </div>
        ))}
      </dl>
    </aside>
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

/** Stored English notes that flag a problem; shown evidence carries the flag itself. */
const WARN = /^(Not |Invalid|Date is in the future|Earlier than)/;
const warns = (e: EvidenceRef | ShownEvidence) => ("warn" in e ? e.warn : WARN.test(e.note ?? ""));

/**
 * Where each value came from. Values, quotes and file names are shown as they are in the
 * documents; a note that is a check's own English message is marked as English.
 */
export async function EvidenceTable({ caseId, evidence, compact }: { caseId: string; evidence: (EvidenceRef | ShownEvidence)[]; compact?: boolean }) {
  const { m } = await getI18n();
  const t = m.findings.table;
  if (!evidence.length) return <p className="text-sm text-muted">{t.none}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-line text-xs text-muted">
            <th className="py-1.5 pr-3 font-medium">{t.source}</th>
            <th className="py-1.5 pr-3 font-medium">{t.field}</th>
            <th className="py-1.5 pr-3 font-medium">{t.value}</th>
            {!compact && <th className="py-1.5 pr-3 font-medium">{t.quote}</th>}
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
                  {e.note ? (
                    <div lang={"noteLang" in e ? e.noteLang : undefined} className={`mt-0.5 font-sans text-xs ${warns(e) ? "text-conflict-fg" : "text-muted"}`}>
                      {e.note}
                    </div>
                  ) : null}
                </td>
                {!compact && (
                  <td className="py-2 pr-3 text-xs text-muted">
                    {e.page ? <span className="mr-1 font-medium text-ink">{format(t.page, { page: e.page })}</span> : null}
                    {e.quote ? <q className="italic">{e.quote}</q> : e.documentId ? "—" : null}
                    {e.confidence !== null ? <span className="tech-detail ml-1 whitespace-nowrap">· {format(t.confidence, { percent: Math.round(e.confidence * 100) })}</span> : null}
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

export async function ReviewStamp({ state }: { state: ReviewState }) {
  if (!state.latest) return null;
  const { m } = await getI18n();
  const t = m.findings.stamp;
  const r = state.latest;
  const tone = state.stale ? "border-amber-300 bg-amber-50" : r.resolution === "resolved" ? "border-verified-dot/30 bg-verified-bg/60" : "border-line bg-brand-50";
  return (
    <div className={`rounded-lg border px-3 py-2 text-sm ${tone}`}>
      <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
        <span className="font-semibold text-ink">{format(t.title, { resolution: m.labels.resolution[r.resolution] })}</span>
        <span>{format(t.by, { reviewer: r.reviewer })}</span>
        <span>
          · <DateTime iso={r.at} />
        </span>
      </div>
      <p className="mt-1 text-ink">{r.note}</p>
      {state.stale ? <p className="mt-1 text-xs font-medium text-amber-800">{t.stale}</p> : null}
    </div>
  );
}

/**
 * One check and its evidence. `finding` comes from findingView(), in the reader's language; when
 * the stored record could not be re-worded it is shown in English and says so.
 */
export async function FindingCard({ caseId, finding, review, children }: { caseId: string; finding: ShownFinding; review?: ReviewState; children?: ReactNode }) {
  const { locale, m } = await getI18n();
  const t = m.findings;
  const english = finding.lang !== locale;
  return (
    // min-w-0 and minmax(0,1fr) columns let a wide evidence table scroll inside the card on phones
    // instead of stretching the card (and the page) past the screen.
    <article className="card min-w-0 p-5" id={finding.id}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <h3 lang={english ? finding.lang : undefined} className="text-base font-semibold text-ink">
          {finding.title}
        </h3>
        <StatusBadge status={finding.status} detail={finding.status === "conflict" ? (review?.open === false ? t.reviewed : t.needsReview) : undefined} />
      </header>
      {english ? <p className="mt-1 text-xs text-muted">{t.recordedInEnglish}</p> : null}
      <dl className="mt-3 grid grid-cols-1 gap-3 text-sm">
        <div>
          <dt className="label">{t.checked}</dt>
          <dd lang={english ? finding.lang : undefined} className="mt-0.5 text-ink">
            {finding.checked}
          </dd>
        </div>
        <div>
          <dt className="label">{t.result}</dt>
          <dd lang={english ? finding.lang : undefined} className="mt-0.5 text-ink">
            {finding.result}
          </dd>
        </div>
        <div>
          <dt className="label">{t.evidence}</dt>
          <dd className="mt-1">
            <EvidenceTable caseId={caseId} evidence={finding.evidence} />
          </dd>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <dt className="label">{t.why}</dt>
            <dd lang={english ? finding.lang : undefined} className="mt-0.5 text-ink">
              {finding.whyItMatters}
            </dd>
          </div>
          <div>
            <dt className="label">{t.next}</dt>
            <dd lang={english && finding.nextAction ? finding.lang : undefined} className="mt-0.5 text-ink">
              {finding.nextAction ?? t.noneRequired}
            </dd>
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

/** For text-only contexts (titles, exports). Server-rendered, so it states UTC; pages use <DateTime> to show local time. */
export function fmtDate(iso: string) {
  return formatUtc(iso, true);
}

export function fmtDateTime(iso: string) {
  return formatUtc(iso);
}
