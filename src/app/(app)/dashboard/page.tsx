import Link from "next/link";
import { cookies } from "next/headers";
import { DashboardFilters, WelcomePanel } from "@/components/dashboard-client";
import { DateTime, EmptyState, PageTitle, StatusBadge, StatusKey, SyntheticBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { listCases } from "@/lib/cases";
import { dashboardRows, filterDashboard, parseDashboardQuery, type Show } from "@/lib/dashboard";
import { STAGE_LABEL, currentFindings } from "@/lib/derive";
import { WELCOME_COOKIE } from "@/lib/preferences";
import type { Status } from "@/lib/types";

export const dynamic = "force-dynamic";

// The demo case the getting-started guide opens: the landing page's sample report, made real.
const DEMO_CASE_ID = "demo-hero-id3";

/** A number card that opens the matching list. */
function Stat({ label, value, hint, href, current, tone }: { label: string; value: number; hint: string; href: string; current: boolean; tone?: "conflict" }) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={`card block p-5 transition-colors hover:border-brand-500 hover:bg-brand-50/50 ${current ? "border-brand-600 ring-1 ring-brand-600" : ""}`}
    >
      <span className="label block">{label}</span>
      <span className={`mt-1 block text-3xl font-semibold tabular-nums ${tone === "conflict" && value ? "text-conflict-fg" : "text-ink"}`}>{value}</span>
      <span className="mt-1 block text-xs text-muted">{hint}</span>
      <span className="mt-2 block text-sm font-medium text-brand-600">{current ? "Showing below" : "Show these cases →"}</span>
    </Link>
  );
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export default async function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser();
  const sp = await searchParams;
  const query = parseDashboardQuery(sp);
  const showArchived = sp.archived === "1";
  const welcome = (await cookies()).get(WELCOME_COOKIE)?.value !== "hidden";
  let all;
  try {
    all = await listCases({ includeArchived: true });
  } catch (e) {
    console.error(e);
    return (
      <EmptyState title="Cases could not be loaded">
        The storage backend did not respond. Check the server configuration and try again.
      </EmptyState>
    );
  }
  const archivedCount = all.filter((c) => c.archivedAt).length;
  const activeRows = dashboardRows(all.filter((c) => !c.archivedAt));
  const listed = showArchived ? dashboardRows(all.filter((c) => c.archivedAt)) : activeRows;
  const rows = filterDashboard(listed, query);
  const totals = {
    awaiting: activeRows.filter((r) => r.summary.stage === "awaiting_review").length,
    conflicts: activeRows.reduce((a, r) => a + r.summary.openConflicts, 0),
    missing: activeRows.reduce((a, r) => a + r.summary.missingEvidence, 0),
  };
  const statHref = (show: Show) => (show === "all" ? "/dashboard" : `/dashboard?show=${show}`);
  const isCurrent = (show: Show) => !showArchived && !query.q && query.show === show;

  return (
    <>
      <PageTitle
        eyebrow="Used EV purchase review"
        title="Dashboard"
        actions={
          <Link href="/cases/new" className="btn btn-primary">
            New case
          </Link>
        }
      >
        Know what is verified, what is only claimed, and what is missing before you make an offer on a used EV.
      </PageTitle>

      {welcome && <WelcomePanel demoCaseId={DEMO_CASE_ID} />}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="All cases" value={activeRows.length} hint={`Including the demo cases${archivedCount ? `; ${archivedCount} archived not counted` : ""}`} href={statHref("all")} current={isCurrent("all")} />
        <Stat label="Need review" value={totals.awaiting} hint="Cases with open items for a person" href={statHref("awaiting_review")} current={isCurrent("awaiting_review")} />
        <Stat label="Open conflicts" value={totals.conflicts} hint="Sources disagree or a check failed" href={statHref("conflicts")} current={isCurrent("conflicts")} tone="conflict" />
        <Stat label="Missing evidence" value={totals.missing} hint="Gaps that could change the decision" href={statHref("missing")} current={isCurrent("missing")} />
      </div>

      <section aria-labelledby="cases-title" className="card overflow-hidden">
        <div className="grid gap-4 border-b border-line px-5 py-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="cases-title" className="font-semibold">
              {showArchived ? "Archived cases" : "Cases"}
            </h2>
            <span className="flex items-center gap-3 text-sm text-muted">
              <span aria-live="polite">{rows.length === listed.length ? plural(listed.length, "case") : `${rows.length} of ${plural(listed.length, "case")}`}</span>
              {showArchived ? (
                <Link href="/dashboard" className="link">
                  Back to active cases
                </Link>
              ) : archivedCount ? (
                <Link href="/dashboard?archived=1" className="link">
                  Show archived ({archivedCount})
                </Link>
              ) : null}
            </span>
          </div>
          <DashboardFilters query={query} showArchived={showArchived} />
        </div>

        {rows.length === 0 ? (
          <div className="p-5">
            {listed.length ? (
              <EmptyState title="No cases match">
                <Link href={showArchived ? "/dashboard?archived=1" : "/dashboard"} className="link">
                  Clear the search and filters
                </Link>
              </EmptyState>
            ) : showArchived ? (
              <EmptyState title="No archived cases" />
            ) : (
              <EmptyState title="No cases yet">Create a case to start reviewing documents.</EmptyState>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map(({ c, summary: s, vehicle, sameVin }) => {
              const findings = currentFindings(c);
              const counts = (["conflict", "unknown", "consistent", "verified"] as Status[])
                .map((st) => ({ st, n: findings.filter((f) => f.status === st && f.id !== "authenticity").length }))
                .filter((x) => x.n);
              return (
                <li key={c.id}>
                  {/* The whole row is one link: one tab stop, and its text describes the case. */}
                  <Link href={`/cases/${c.id}`} className="group grid gap-x-6 gap-y-2 px-5 py-4 hover:bg-brand-50/60 md:grid-cols-[minmax(0,1fr)_minmax(0,14rem)_10rem]">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-ink group-hover:underline">{vehicle || "Vehicle not entered"}</span>
                        {c.synthetic ? <SyntheticBadge /> : null}
                      </p>
                      <p className="mt-0.5 text-sm text-muted">
                        {c.caseNumber}
                        {c.reference ? <span className="font-medium text-ink"> · {c.reference}</span> : null} · {plural(c.documents.length, "document")}
                      </p>
                      <p className="mt-0.5 break-all text-xs text-muted">
                        VIN <span className="font-mono">{c.vehicle.vin || "not entered"}</span>
                        {sameVin ? <span className="font-medium text-conflict-fg"> · same VIN as {plural(sameVin, "other case")}</span> : null}
                      </p>
                    </div>
                    <div className="flex flex-wrap content-start gap-1">
                      {counts.map(({ st, n }) => (
                        <StatusBadge key={st} status={st} detail={String(n)} size="sm" />
                      ))}
                    </div>
                    <div className="text-sm md:text-right">
                      <span className={s.stage === "awaiting_review" ? "font-semibold text-conflict-fg" : "text-muted"}>{STAGE_LABEL[s.stage]}</span>
                      {s.openReviewItems ? <span className="block text-xs text-muted">{plural(s.openReviewItems, "open item")}</span> : null}
                      <span className="block whitespace-nowrap text-xs text-muted">
                        Opened <DateTime iso={c.createdAt} dateOnly />
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <StatusKey className="mt-6" />

      <p className="mt-6 text-xs text-muted">
        VoltProof is an evidence-review tool. It does not value vehicles, test batteries, certify documents or detect fraud automatically. Findings marked Conflict need a person to review them.
      </p>
    </>
  );
}
