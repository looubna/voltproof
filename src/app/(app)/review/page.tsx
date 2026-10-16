import Link from "next/link";
import { ReviewForm } from "@/components/client";
import { CaseHeader } from "@/components/case-header";
import { EmptyState, FindingCard, PageTitle, SyntheticBadge, fmtDateTime } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { listCases } from "@/lib/cases";
import { reviewQueue, reviewsFor } from "@/lib/derive";
import { RESOLUTION_LABEL, STATUS_LABEL } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function ReviewQueuePage({ searchParams }: { searchParams: Promise<{ case?: string; show?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const showAll = sp.show === "all";
  const cases = (await listCases()).filter((c) => !sp.case || c.id === sp.case);
  const single = sp.case ? cases[0] : null;

  const groups = cases
    .map((c) => ({ c, items: reviewQueue(c).filter((i) => showAll || i.review.open).sort((a, b) => (a.finding.status === "conflict" ? -1 : 0) - (b.finding.status === "conflict" ? -1 : 0)) }))
    .filter((g) => g.items.length);
  const total = groups.reduce((a, g) => a + g.items.length, 0);
  const base = sp.case ? `/review?case=${sp.case}` : "/review";
  const sep = sp.case ? "&" : "?";

  return (
    <>
      {single ? (
        <CaseHeader c={single} active="review" />
      ) : (
        <PageTitle eyebrow="People resolve" title="Human review queue">
          Conflicts and missing evidence that need a person. Your decision is recorded separately; the original machine finding is never changed.
        </PageTitle>
      )}

      <div className="mb-5 flex flex-wrap items-center gap-2 text-sm">
        <Link href={base} className={`rounded-full px-3 py-1 ${!showAll ? "bg-brand-600 text-white" : "bg-[#fdfcfa] text-muted ring-1 ring-line"}`}>
          Open items
        </Link>
        <Link href={`${base}${sep}show=all`} className={`rounded-full px-3 py-1 ${showAll ? "bg-brand-600 text-white" : "bg-[#fdfcfa] text-muted ring-1 ring-line"}`}>
          All review items
        </Link>
        <span className="ml-2 text-muted">
          {total} item{total === 1 ? "" : "s"}
        </span>
      </div>

      {groups.length === 0 ? (
        <EmptyState title={showAll ? "Nothing needs review" : "No open items"}>
          {showAll ? "No findings in this view require human review." : "Every flagged item has been resolved by a reviewer."}
        </EmptyState>
      ) : (
        <div className="grid gap-10">
          {groups.map(({ c, items }) => (
            <section key={c.id}>
              {!single && (
                <h2 className="mb-3 flex flex-wrap items-center gap-2 font-semibold">
                  <Link href={`/cases/${c.id}`} className="link">
                    {c.caseNumber}
                  </Link>
                  <span>
                    · {c.vehicle.year} {c.vehicle.make} {c.vehicle.model}
                  </span>
                  {c.synthetic ? <SyntheticBadge /> : null}
                </h2>
              )}
              <div className="grid gap-5">
                {items.map(({ finding, review }) => {
                  const history = reviewsFor(c, finding.id);
                  return (
                    <FindingCard key={finding.id} caseId={c.id} finding={finding} review={review}>
                      {history.length > 1 && (
                        <details className="mb-3 text-sm">
                          <summary className="cursor-pointer text-muted">Review history ({history.length})</summary>
                          <ol className="mt-2 grid gap-2 border-l-2 border-line pl-3">
                            {history.map((r) => (
                              <li key={r.id} className="text-xs">
                                <span className="font-medium">{RESOLUTION_LABEL[r.resolution]}</span> by {r.reviewer} · {fmtDateTime(r.at)}
                                <div className="text-muted">Machine status at the time: {STATUS_LABEL[r.findingSnapshot.status]}</div>
                                <div>{r.note}</div>
                              </li>
                            ))}
                          </ol>
                        </details>
                      )}
                      <ReviewForm caseId={c.id} findingId={finding.id} reviewer={user} />
                    </FindingCard>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
