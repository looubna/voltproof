import Link from "next/link";
import { WithdrawClaimButton } from "@/components/client";
import { StatusBadge, docHref } from "@/components/ui";
import { claimSummaryLine } from "@/lib/claims/assess";
import { vinTail } from "@/lib/normalize";
import type { Case, Finding } from "@/lib/types";

/** The landing page's "evidence report" card, built from the latest claim assessments. */
export function ClaimsCard({ c, findings, editable = false }: { c: Case; findings: Finding[]; editable?: boolean }) {
  const claims = findings.filter((f) => f.claim);
  const summary = claimSummaryLine(claims);
  const [first, ...rest] = (summary ?? "").split(/(?<=\.) /);
  return (
    <section className="card overflow-hidden">
      <header className="border-b border-line px-5 py-4">
        <div className="label">Evidence report</div>
        <h2 className="mt-0.5 text-lg font-semibold">
          {c.vehicle.year} {c.vehicle.make} {c.vehicle.model}
        </h2>
        <p className="text-xs text-muted">
          {c.vehicle.vin ? `VIN ending ${vinTail(c.vehicle.vin)} · ` : ""}
          {claims.length} claim{claims.length === 1 ? "" : "s"} checked
        </p>
      </header>
      {claims.length === 0 ? (
        <p className="px-5 py-5 text-sm text-muted">No seller claims yet. Paste the seller's listing below to check what they say against the documents.</p>
      ) : (
        <ul className="divide-y divide-line">
          {claims.map((f) => {
            const src = f.evidence.find((e) => e.documentId && !(e.note ?? "").startsWith("Not used"));
            const href = src ? docHref(c.id, src) : null;
            return (
              <li key={f.id} className="px-5 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/cases/${c.id}/evidence#${f.id}`} className="text-sm font-semibold hover:underline">
                    {f.claim!.label}
                  </Link>
                  <StatusBadge status={f.status} />
                </div>
                <p className="mt-0.5 text-sm text-muted">{f.claim!.headline}</p>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
                  {href && src ? (
                    <Link href={href} className="link">
                      Source: {src.documentName}
                      {src.page ? `, p.${src.page}` : ""}
                    </Link>
                  ) : f.claim!.missing ? (
                    <span className="text-muted">Missing: {f.claim!.missing}</span>
                  ) : null}
                  {editable && <WithdrawClaimButton caseId={c.id} claimId={f.claim!.claimId} />}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {summary && (
        <p className="m-4 rounded-lg bg-canvas px-4 py-3 text-sm">
          <strong>{first}</strong> {rest.join(" ")}
        </p>
      )}
    </section>
  );
}
