import Link from "next/link";
import { EmptyState, PageTitle, StatusBadge, SyntheticBadge, DateTime } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { listCases } from "@/lib/cases";
import { STAGE_LABEL, caseSummary, currentFindings } from "@/lib/derive";
import type { Status } from "@/lib/types";

export const dynamic = "force-dynamic";

function Stat({ label, value, hint, tone }: { label: string; value: number; hint: string; tone?: "conflict" | "unknown" }) {
  return (
    <div className="card p-5">
      <div className="label">{label}</div>
      <div className={`mt-1 text-3xl font-semibold tabular-nums ${tone === "conflict" && value ? "text-conflict-fg" : "text-ink"}`}>{value}</div>
      <div className="mt-1 text-xs text-muted">{hint}</div>
    </div>
  );
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ archived?: string }> }) {
  await requireUser();
  const showArchived = (await searchParams).archived === "1";
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
  const cases = all.filter((c) => !!c.archivedAt === showArchived);
  const active = showArchived ? all.filter((c) => !c.archivedAt) : cases;
  const rows = cases.map((c) => ({ c, s: caseSummary(c), findings: currentFindings(c) }));
  const activeRows = showArchived ? active.map((c) => ({ c, s: caseSummary(c) })) : rows;
  const totals = {
    awaiting: activeRows.filter((r) => r.s.stage === "awaiting_review").length,
    conflicts: activeRows.reduce((a, r) => a + r.s.openConflicts, 0),
    missing: activeRows.reduce((a, r) => a + r.s.missingEvidence, 0),
  };

  return (
    <>
      <PageTitle
        eyebrow="Dealer purchase evidence review"
        title="Dashboard"
        actions={
          <Link href="/cases/new" className="btn btn-primary">
            New case
          </Link>
        }
      >
        Know what is verified, what is only claimed, and what is missing before you make an offer on a used EV.
      </PageTitle>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total cases" value={active.length} hint={`Including synthetic demo cases${archivedCount ? `; ${archivedCount} archived not counted` : ""}`} />
        <Stat label="Awaiting review" value={totals.awaiting} hint="Cases with open items for a person" />
        <Stat label="Open conflicts" value={totals.conflicts} hint="Sources disagree or a check failed" tone="conflict" />
        <Stat label="Missing evidence" value={totals.missing} hint="Unknowns that could affect the decision" />
      </div>

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="font-semibold">{showArchived ? "Archived cases" : "Cases"}</h2>
          <span className="flex items-center gap-3 text-xs text-muted">
            Newest first
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
        {rows.length === 0 ? (
          <div className="p-5">
            {showArchived ? <EmptyState title="No archived cases" /> : <EmptyState title="No cases yet">Create a case to start reviewing documents.</EmptyState>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-canvas text-xs text-muted">
                <tr>
                  <th className="px-5 py-2 font-medium">Case</th>
                  <th className="px-3 py-2 font-medium">Vehicle</th>
                  <th className="px-3 py-2 font-medium">Documents</th>
                  <th className="px-3 py-2 font-medium">Findings</th>
                  <th className="px-3 py-2 font-medium">Stage</th>
                  <th className="px-3 py-2 font-medium">Opened</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ c, s, findings }) => {
                  const counts = (["conflict", "unknown", "consistent", "verified"] as Status[])
                    .map((st) => ({ st, n: findings.filter((f) => f.status === st && f.id !== "authenticity").length }))
                    .filter((x) => x.n);
                  return (
                    <tr key={c.id} className="border-t border-line hover:bg-brand-50/60">
                      <td className="px-5 py-3">
                        <Link href={`/cases/${c.id}`} className="link font-medium">
                          {c.caseNumber}
                        </Link>
                        {c.synthetic ? <div className="mt-1"><SyntheticBadge /></div> : null}
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-medium">
                          {c.vehicle.year} {c.vehicle.make} {c.vehicle.model}
                        </div>
                        <div className="font-mono text-xs text-muted">{c.vehicle.vin || "VIN not entered"}</div>
                      </td>
                      <td className="px-3 py-3 tabular-nums">{c.documents.length}</td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          {counts.map(({ st, n }) => (
                            <StatusBadge key={st} status={st} detail={String(n)} size="sm" />
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className={s.stage === "awaiting_review" ? "font-medium text-conflict-fg" : "text-muted"}>{STAGE_LABEL[s.stage]}</span>
                        {s.openReviewItems ? <div className="text-xs text-muted">{s.openReviewItems} open item{s.openReviewItems === 1 ? "" : "s"}</div> : null}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-muted"><DateTime iso={c.createdAt} dateOnly /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="mt-6 text-xs text-muted">
        VoltProof is an evidence-review tool. It does not value vehicles, test batteries, certify documents or detect fraud automatically.
        Findings marked Conflict need a person to review them.
      </p>
    </>
  );
}
