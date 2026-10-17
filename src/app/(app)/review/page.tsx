import Link from "next/link";
import { ReviewFilters, ReviewForm } from "@/components/client";
import { CaseHeader } from "@/components/case-header";
import { NavLink } from "@/components/nav-link";
import { DateTime, EmptyState, FindingCard, PageTitle, StatusKey, SyntheticBadge } from "@/components/ui";
import { format, formatPlural } from "@/i18n/format";
import { rich } from "@/i18n/rich";
import { getI18n } from "@/i18n/server";
import { requireUser } from "@/lib/auth";
import { getCase, listCases } from "@/lib/cases";
import { reviewQueue, reviewsFor } from "@/lib/derive";
import { findingView, type FindingView } from "@/lib/localize";
import type { Case } from "@/lib/types";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

type Search = { case?: string; show?: string; status?: string; q?: string; page?: string };

/** The queue URL with some parameters changed (empty values are dropped). */
function hrefWith(sp: Search, changes: Partial<Search>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...sp, ...changes })) if (v) q.set(k, v);
  return `/review${q.size ? `?${q}` : ""}`;
}

export default async function ReviewQueuePage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const { locale, m } = await getI18n();
  const t = m.review;
  const showAll = sp.show === "all";
  const status = sp.status === "conflict" || sp.status === "unknown" ? sp.status : null;
  const query = (sp.q ?? "").trim().toLowerCase().slice(0, 80);

  // One case (its Review tab, even if archived) or every active case.
  const single = sp.case ? await getCase(sp.case).catch(() => null) : null;
  const cases: Case[] = sp.case ? (single ? [single] : []) : await listCases();

  // Each case's findings in the reader's language, worked out only for cases with something to review.
  const views = new Map<string, FindingView>();
  const viewOf = (c: Case) => {
    let v = views.get(c.id);
    if (!v) views.set(c.id, (v = findingView(c, locale)));
    return v;
  };

  const vehicleOf = (c: Case) => [c.vehicle.year, c.vehicle.make, c.vehicle.model].filter(Boolean).join(" ");
  const items = cases.flatMap((c) =>
    reviewQueue(c)
      .filter((i) => showAll || i.review.open)
      .filter((i) => !status || i.finding.status === status)
      .filter((i) => {
        if (!query) return true;
        // Search what the reader sees and the stored English, so either language finds an item.
        const shown = viewOf(c)(i.finding);
        return [shown.title, shown.result, i.finding.title, i.finding.result, c.caseNumber, vehicleOf(c)].some((x) => x.toLowerCase().includes(query));
      })
      .sort((a, b) => (a.finding.status === "conflict" ? 0 : 1) - (b.finding.status === "conflict" ? 0 : 1))
      .map((i) => ({ ...i, c })),
  );
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1));
  const shown = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Group the visible page by case, keeping the queue order.
  const groups: { c: Case; items: typeof shown }[] = [];
  for (const it of shown) {
    const g = groups.at(-1);
    if (g && g.c.id === it.c.id) g.items.push(it);
    else groups.push({ c: it.c, items: [it] });
  }

  const caseOptions = sp.case ? [] : cases.filter((c) => reviewQueue(c).length).map((c) => ({ id: c.id, label: `${c.caseNumber} · ${vehicleOf(c)}` }));
  const filtered = !!(status || query);
  const pill = (on: boolean) => `inline-flex items-center rounded-full px-3 py-1 ${on ? "bg-brand-600 text-white" : "bg-[#fdfcfa] text-muted ring-1 ring-line hover:text-ink"}`;
  const formCopy = { ...t.form, saving: m.common.saving, requestFailed: m.errors.requestFailed };

  return (
    <>
      {single ? (
        <CaseHeader c={single} active="review" />
      ) : (
        <PageTitle eyebrow={t.eyebrow} title={t.title}>
          {t.intro}
        </PageTitle>
      )}

      {sp.case && !single ? (
        <EmptyState title={t.caseNotFound}>
          <Link href="/review" className="link">
            {t.showAll}
          </Link>
        </EmptyState>
      ) : (
        <>
          <div className="mb-5 grid gap-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <NavLink href={hrefWith(sp, { show: undefined, page: undefined })} aria-current={!showAll ? "page" : undefined} className={pill(!showAll)} scroll={false}>
                {t.open}
              </NavLink>
              <NavLink href={hrefWith(sp, { show: "all", page: undefined })} aria-current={showAll ? "page" : undefined} className={pill(showAll)} scroll={false}>
                {t.all}
              </NavLink>
              <span className="ml-2 text-muted" data-testid="review-count">
                {formatPlural(locale, t.count, total)}
                {pages > 1 ? format(t.page, { page, pages }) : ""}
              </span>
            </div>
            <ReviewFilters cases={caseOptions} showCase={!sp.case} copy={{ ...t.filters, updating: m.common.updating }} />
            <StatusKey />
          </div>

          {groups.length === 0 ? (
            single && single.documents.length === 0 ? (
              <EmptyState title={t.nothingYet}>
                {t.nothingYetBody}{" "}
                <Link href={`/cases/${single.id}#upload`} className="link">
                  {t.uploadDocuments}
                </Link>
              </EmptyState>
            ) : (
              <EmptyState title={filtered ? t.noMatch : showAll ? t.nothingNeeds : t.noOpen}>
                {filtered ? (
                  <Link href={hrefWith(sp, { status: undefined, q: undefined, page: undefined })} className="link">
                    {t.clearFilters}
                  </Link>
                ) : showAll ? (
                  t.noneRequire
                ) : (
                  t.allResolved
                )}
              </EmptyState>
            )
          ) : (
            <div className="grid gap-10">
              {groups.map(({ c, items }) => (
                <section key={c.id}>
                  {!single && (
                    <h2 className="mb-3 flex flex-wrap items-center gap-2 font-semibold">
                      <Link href={`/cases/${c.id}`} className="link">
                        {c.caseNumber}
                      </Link>
                      <span>· {vehicleOf(c)}</span>
                      {c.synthetic ? <SyntheticBadge /> : null}
                    </h2>
                  )}
                  <div className="grid gap-5">
                    {items.map(({ finding, review }) => {
                      const history = reviewsFor(c, finding.id);
                      return (
                        <FindingCard key={finding.id} caseId={c.id} finding={viewOf(c)(finding)} review={review}>
                          {history.length > 1 && (
                            <details className="mb-3 text-sm">
                              <summary className="cursor-pointer text-muted">{format(t.history, { count: history.length })}</summary>
                              <ol className="mt-2 grid gap-2 border-l-2 border-line pl-3">
                                {history.map((r) => (
                                  <li key={r.id} className="text-xs">
                                    {rich(format(t.historyLine, { resolution: m.labels.resolution[r.resolution], reviewer: r.reviewer }), {
                                      date: <DateTime iso={r.at} />,
                                    })}
                                    <div className="text-muted">{format(t.machineStatus, { status: m.status[r.findingSnapshot.status] })}</div>
                                    <div>{r.note}</div>
                                  </li>
                                ))}
                              </ol>
                            </details>
                          )}
                          <ReviewForm caseId={c.id} findingId={finding.id} reviewer={user} copy={formCopy} />
                        </FindingCard>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}

          {pages > 1 && (
            <nav aria-label={t.pages} className="mt-8 flex flex-wrap items-center justify-between gap-3 text-sm">
              {page > 1 ? (
                <NavLink href={hrefWith(sp, { page: String(page - 1) })} className="btn btn-secondary">
                  {t.previous}
                </NavLink>
              ) : (
                <span />
              )}
              <span className="text-muted">{format(t.items, { from: (page - 1) * PAGE_SIZE + 1, to: Math.min(page * PAGE_SIZE, total), total })}</span>
              {page < pages ? (
                <NavLink href={hrefWith(sp, { page: String(page + 1) })} className="btn btn-secondary">
                  {t.next}
                </NavLink>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      )}
    </>
  );
}
