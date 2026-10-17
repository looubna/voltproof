import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ArchiveCaseButton, ResetCaseButton } from "@/components/client";
import { NavLink } from "@/components/nav-link";
import { DateTime, SyntheticBadge } from "@/components/ui";
import { format, formatPlural } from "@/i18n/format";
import { rich } from "@/i18n/rich";
import { getI18n } from "@/i18n/server";
import { getCase } from "@/lib/cases";
import { caseSummary } from "@/lib/derive";
import type { Case } from "@/lib/types";

/** Loads a case or renders the 404 page. Cached per request, so a layout and its page share one read. */
export const loadCase = cache(async (id: string): Promise<Case> => {
  const c = await getCase(id).catch(() => null);
  if (!c) notFound();
  return c;
});

const TABS = [
  { key: "overview", href: (id: string) => `/cases/${id}` },
  { key: "evidence", short: true, href: (id: string) => `/cases/${id}/evidence` },
  { key: "review", href: (id: string) => `/review?case=${id}` },
  { key: "report", href: (id: string) => `/cases/${id}/report` },
] as const;

export async function CaseHeader({ c, active }: { c: Case; active: string }) {
  const { locale, m } = await getI18n();
  const t = m.caseHeader;
  const s = caseSummary(c);
  return (
    <div className="no-print mb-6">
      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted">
        <Link href="/dashboard" className="hover:underline">
          {m.nav.dashboard}
        </Link>
        <span>/</span>
        <span className="font-mono">{c.caseNumber}</span>
        {c.synthetic ? <SyntheticBadge /> : null}
        {c.archivedAt ? <span className="rounded-full bg-unknown-bg px-2 py-0.5 text-xs font-semibold text-unknown-fg">{t.archived}</span> : null}
      </div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {c.vehicle.year} {c.vehicle.make} {c.vehicle.model}
          </h1>
          <p className="mt-0.5 wrap-break-word text-sm text-muted">
            {c.reference ? <span className="font-medium text-ink">{c.reference} · </span> : null}
            {c.vehicle.vin ? rich(m.dashboard.list.vin, { vin: <span className="break-all font-mono text-ink">{c.vehicle.vin}</span> }) : m.dashboard.list.vinMissing} ·{" "}
            {c.documents.length ? `${formatPlural(locale, m.dashboard.list.documents, c.documents.length)} · ` : ""}
            <span className={s.stage === "awaiting_review" ? "font-medium text-conflict-fg" : ""}>{m.dashboard.stage[s.stage]}</span>
          </p>
        </div>
        {c.synthetic ? (
          <ResetCaseButton caseId={c.id} copy={{ ...t.reset, cancel: m.common.cancel }} />
        ) : (
          <ArchiveCaseButton caseId={c.id} archived={!!c.archivedAt} copy={{ ...t.archive, cancel: m.common.cancel, requestFailed: m.errors.requestFailed }} />
        )}
      </div>
      {c.archivedAt ? (
        <p className="mt-3 rounded-lg border border-line bg-canvas px-4 py-2 text-sm text-muted">
          {rich(format(t.archivedBy, { who: c.archivedBy ?? t.aReviewer }), { date: <DateTime iso={c.archivedAt} /> })}
        </p>
      ) : null}
      {/* The border sits on the wrapper and the nav overlaps it by 1px, so the active tab's underline covers it
          without the nav overflowing vertically (which showed stray scrollbars). */}
      <div className="mt-5 border-b border-line">
        <nav aria-label={t.sections} className="-mb-px flex gap-1 overflow-x-auto overflow-y-hidden text-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map((tab) => (
            <NavLink
              key={tab.key}
              href={tab.href(c.id)}
              aria-current={active === tab.key ? "page" : undefined}
              className={`inline-flex shrink-0 items-center whitespace-nowrap border-b-2 px-2.5 py-2 sm:px-3 ${active === tab.key ? "border-brand-600 font-medium text-brand-700" : "border-transparent text-muted hover:text-ink"}`}
            >
              {"short" in tab ? (
                <>
                  <span className="sm:hidden">{t.tabs.evidenceShort}</span>
                  <span className="hidden sm:inline">{t.tabs[tab.key]}</span>
                </>
              ) : (
                t.tabs[tab.key]
              )}
              {tab.key === "review" && s.openReviewItems ? (
                <span className="ml-1.5 rounded-full bg-conflict-bg px-1.5 py-0.5 text-xs font-semibold text-conflict-fg" aria-label={format(t.open, { count: s.openReviewItems })}>
                  {s.openReviewItems}
                </span>
              ) : null}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
