import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ArchiveCaseButton, ResetCaseButton } from "@/components/client";
import { NavLink } from "@/components/nav-link";
import { DateTime, SyntheticBadge } from "@/components/ui";
import { getCase } from "@/lib/cases";
import { STAGE_LABEL, caseSummary } from "@/lib/derive";
import type { Case } from "@/lib/types";

/** Loads a case or renders the 404 page. Cached per request, so a layout and its page share one read. */
export const loadCase = cache(async (id: string): Promise<Case> => {
  const c = await getCase(id).catch(() => null);
  if (!c) notFound();
  return c;
});

const TABS = [
  { key: "overview", label: "Overview", href: (id: string) => `/cases/${id}` },
  { key: "evidence", label: "Evidence & checks", short: "Evidence", href: (id: string) => `/cases/${id}/evidence` },
  { key: "review", label: "Review", href: (id: string) => `/review?case=${id}` },
  { key: "report", label: "Report", href: (id: string) => `/cases/${id}/report` },
];

export function CaseHeader({ c, active }: { c: Case; active: string }) {
  const s = caseSummary(c);
  return (
    <div className="no-print mb-6">
      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted">
        <Link href="/dashboard" className="hover:underline">
          Dashboard
        </Link>
        <span>/</span>
        <span className="font-mono">{c.caseNumber}</span>
        {c.synthetic ? <SyntheticBadge /> : null}
        {c.archivedAt ? <span className="rounded-full bg-unknown-bg px-2 py-0.5 text-[11px] font-semibold text-unknown-fg">Archived</span> : null}
      </div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {c.vehicle.year} {c.vehicle.make} {c.vehicle.model}
          </h1>
          <p className="mt-0.5 text-sm text-muted">
            VIN <span className="font-mono text-ink">{c.vehicle.vin || "not entered"}</span> · {c.documents.length} document{c.documents.length === 1 ? "" : "s"} ·{" "}
            <span className={s.stage === "awaiting_review" ? "font-medium text-conflict-fg" : ""}>{STAGE_LABEL[s.stage]}</span>
          </p>
        </div>
        {c.synthetic ? <ResetCaseButton caseId={c.id} /> : <ArchiveCaseButton caseId={c.id} archived={!!c.archivedAt} />}
      </div>
      {c.archivedAt ? (
        <p className="mt-3 rounded-lg border border-line bg-canvas px-4 py-2 text-sm text-muted">
          Archived by {c.archivedBy ?? "a reviewer"} on <DateTime iso={c.archivedAt} />. It is hidden from the dashboard and review queue; its documents and history are kept.
        </p>
      ) : null}
      {/* The border sits on the wrapper and the nav overlaps it by 1px, so the active tab's underline covers it
          without the nav overflowing vertically (which showed stray scrollbars). */}
      <div className="mt-5 border-b border-line">
        <nav aria-label="Case sections" className="-mb-px flex gap-1 overflow-x-auto overflow-y-hidden text-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map((t) => (
            <NavLink
              key={t.key}
              href={t.href(c.id)}
              aria-current={active === t.key ? "page" : undefined}
              className={`inline-flex shrink-0 items-center whitespace-nowrap border-b-2 px-2.5 py-2 sm:px-3 ${active === t.key ? "border-brand-600 font-medium text-brand-700" : "border-transparent text-muted hover:text-ink"}`}
            >
              {t.short ? (
                <>
                  <span className="sm:hidden">{t.short}</span>
                  <span className="hidden sm:inline">{t.label}</span>
                </>
              ) : (
                t.label
              )}
              {t.key === "review" && s.openReviewItems ? (
                <span className="ml-1.5 rounded-full bg-conflict-bg px-1.5 py-0.5 text-[11px] font-semibold text-conflict-fg" aria-label={`${s.openReviewItems} open`}>
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
