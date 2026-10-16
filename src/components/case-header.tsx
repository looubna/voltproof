import Link from "next/link";
import { notFound } from "next/navigation";
import { ResetCaseButton } from "@/components/client";
import { SyntheticBadge } from "@/components/ui";
import { getCase } from "@/lib/cases";
import { STAGE_LABEL, caseSummary } from "@/lib/derive";
import type { Case } from "@/lib/types";

export async function loadCase(id: string): Promise<Case> {
  const c = await getCase(id).catch(() => null);
  if (!c) notFound();
  return c;
}

const TABS = [
  { key: "overview", label: "Overview", href: (id: string) => `/cases/${id}` },
  { key: "evidence", label: "Evidence & checks", href: (id: string) => `/cases/${id}/evidence` },
  { key: "review", label: "Review", href: (id: string) => `/review?case=${id}` },
  { key: "report", label: "Report", href: (id: string) => `/cases/${id}/report` },
];

export function CaseHeader({ c, active }: { c: Case; active: string }) {
  const s = caseSummary(c);
  return (
    <div className="no-print mb-6">
      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted">
        <Link href="/" className="hover:underline">Dashboard</Link>
        <span>/</span>
        <span className="font-mono">{c.caseNumber}</span>
        {c.synthetic ? <SyntheticBadge /> : null}
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
        {c.synthetic ? <ResetCaseButton caseId={c.id} /> : null}
      </div>
      <nav className="mt-5 flex gap-1 overflow-x-auto border-b border-line text-sm">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.href(c.id)}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 ${active === t.key ? "border-brand-600 font-medium text-brand-700" : "border-transparent text-muted hover:text-ink"}`}
          >
            {t.label}
            {t.key === "review" && s.openReviewItems ? (
              <span className="ml-1.5 rounded-full bg-conflict-bg px-1.5 py-0.5 text-[11px] font-semibold text-conflict-fg">{s.openReviewItems}</span>
            ) : null}
          </Link>
        ))}
      </nav>
    </div>
  );
}
