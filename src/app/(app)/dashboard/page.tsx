import Link from "next/link";
import { cookies } from "next/headers";
import { DashboardFilters, WelcomePanel } from "@/components/dashboard-client";
import { DateTime, EmptyState, PageTitle, StatusBadge, StatusKey, SyntheticBadge } from "@/components/ui";
import { formatPlural, format } from "@/i18n/format";
import { rich } from "@/i18n/rich";
import { getI18n } from "@/i18n/server";
import { requireUser } from "@/lib/auth";
import { listCases } from "@/lib/cases";
import { dashboardRows, filterDashboard, parseDashboardQuery, type Show } from "@/lib/dashboard";
import { currentFindings } from "@/lib/derive";
import { WELCOME_COOKIE } from "@/lib/preferences";
import type { Status } from "@/lib/types";

export const dynamic = "force-dynamic";

// The demo case the getting-started guide opens: the landing page's sample report, made real.
const DEMO_CASE_ID = "demo-hero-id3";

/** A number card that opens the matching list. */
function Stat({ label, value, hint, href, current, tone, cta }: { label: string; value: number; hint: string; href: string; current: boolean; tone?: "conflict"; cta: string }) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={`card block p-5 transition-colors hover:border-brand-500 hover:bg-brand-50/50 ${current ? "border-brand-600 ring-1 ring-brand-600" : ""}`}
    >
      <span className="label block">{label}</span>
      <span className={`mt-1 block text-3xl font-semibold tabular-nums ${tone === "conflict" && value ? "text-conflict-fg" : "text-ink"}`}>{value}</span>
      <span className="mt-1 block text-xs text-muted">{hint}</span>
      <span className="mt-2 block text-sm font-medium text-brand-600">{cta}</span>
    </Link>
  );
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser();
  const { locale, m } = await getI18n();
  const t = m.dashboard;
  const count = (forms: Parameters<typeof formatPlural>[1], n: number, values?: Record<string, string | number>) => formatPlural(locale, forms, n, values);

  const sp = await searchParams;
  const query = parseDashboardQuery(sp);
  const showArchived = sp.archived === "1";
  const welcome = (await cookies()).get(WELCOME_COOKIE)?.value !== "hidden";
  let all;
  try {
    all = await listCases({ includeArchived: true });
  } catch (e) {
    console.error(e);
    return <EmptyState title={t.loadError.title}>{t.loadError.body}</EmptyState>;
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
  const cta = (show: Show) => (isCurrent(show) ? t.stats.showing : t.stats.show);

  return (
    <>
      <PageTitle
        eyebrow={t.eyebrow}
        title={t.title}
        actions={
          <Link href="/cases/new" className="btn btn-primary">
            {t.newCase}
          </Link>
        }
      >
        {t.intro}
      </PageTitle>

      {welcome && <WelcomePanel demoCaseId={DEMO_CASE_ID} copy={t.welcome} />}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t.stats.all} value={activeRows.length} hint={archivedCount ? count(t.stats.allHintArchived, archivedCount) : t.stats.allHint} href={statHref("all")} current={isCurrent("all")} cta={cta("all")} />
        <Stat label={t.stats.review} value={totals.awaiting} hint={t.stats.reviewHint} href={statHref("awaiting_review")} current={isCurrent("awaiting_review")} cta={cta("awaiting_review")} />
        <Stat label={t.stats.conflicts} value={totals.conflicts} hint={t.stats.conflictsHint} href={statHref("conflicts")} current={isCurrent("conflicts")} tone="conflict" cta={cta("conflicts")} />
        <Stat label={t.stats.missing} value={totals.missing} hint={t.stats.missingHint} href={statHref("missing")} current={isCurrent("missing")} cta={cta("missing")} />
      </div>

      <section aria-labelledby="cases-title" className="card overflow-hidden">
        <div className="grid gap-4 border-b border-line px-5 py-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="cases-title" className="font-semibold">
              {showArchived ? t.list.archivedTitle : t.list.title}
            </h2>
            <span className="flex items-center gap-3 text-sm text-muted">
              <span aria-live="polite">{rows.length === listed.length ? count(t.list.count, listed.length) : count(t.list.countFiltered, listed.length, { shown: rows.length })}</span>
              {showArchived ? (
                <Link href="/dashboard" className="link">
                  {t.list.backToActive}
                </Link>
              ) : archivedCount ? (
                <Link href="/dashboard?archived=1" className="link">
                  {format(t.list.showArchived, { count: archivedCount })}
                </Link>
              ) : null}
            </span>
          </div>
          <DashboardFilters query={query} showArchived={showArchived} copy={t.filters} />
        </div>

        {rows.length === 0 ? (
          <div className="p-5">
            {listed.length ? (
              <EmptyState title={t.list.noMatch}>
                <Link href={showArchived ? "/dashboard?archived=1" : "/dashboard"} className="link">
                  {t.list.clearAll}
                </Link>
              </EmptyState>
            ) : showArchived ? (
              <EmptyState title={t.list.noArchived} />
            ) : (
              <EmptyState title={t.list.empty}>{t.list.emptyBody}</EmptyState>
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
                  <Link href={`/cases/${c.id}`} className="group grid gap-x-6 gap-y-2 px-5 py-4 hover:bg-brand-50/60 md:grid-cols-[minmax(0,1fr)_minmax(0,14rem)_11rem]">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-ink group-hover:underline">{vehicle || t.list.vehicleMissing}</span>
                        {c.synthetic ? <SyntheticBadge /> : null}
                      </p>
                      <p className="mt-0.5 text-sm text-muted">
                        {c.caseNumber}
                        {c.reference ? <span className="font-medium text-ink"> · {c.reference}</span> : null} · {count(t.list.documents, c.documents.length)}
                      </p>
                      <p className="mt-0.5 break-all text-xs text-muted">
                        {c.vehicle.vin ? rich(t.list.vin, { vin: <span className="font-mono">{c.vehicle.vin}</span> }) : t.list.vinMissing}
                        {sameVin ? <span className="font-medium text-conflict-fg"> · {count(t.list.sameVin, sameVin)}</span> : null}
                      </p>
                    </div>
                    <div className="flex flex-wrap content-start gap-1">
                      {counts.map(({ st, n }) => (
                        <StatusBadge key={st} status={st} detail={String(n)} size="sm" />
                      ))}
                    </div>
                    <div className="text-sm md:text-right">
                      <span className={s.stage === "awaiting_review" ? "font-semibold text-conflict-fg" : "text-muted"}>{t.stage[s.stage]}</span>
                      {s.openReviewItems ? <span className="block text-xs text-muted">{count(t.list.openItems, s.openReviewItems)}</span> : null}
                      <span className="block whitespace-nowrap text-xs text-muted">{rich(t.list.opened, { date: <DateTime iso={c.createdAt} dateOnly /> })}</span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <StatusKey className="mt-6" />

      <p className="mt-6 text-xs text-muted">{format(t.disclaimer, { conflict: m.status.conflict })}</p>
    </>
  );
}
