import Link from "next/link";
import { ClaimsEditor, WithdrawClaimButton } from "@/components/client";
import { StatusBadge, docHref } from "@/components/ui";
import type { Case, Finding } from "@/lib/types";

/**
 * Step 2 of a review: what the seller says about the car, each claim with its
 * status, and the editor to add, change or withdraw claims. What to do about
 * each claim is in the case's "Before you make an offer" box.
 */
export function SellerClaims({ c, findings, defaultListing }: { c: Case; findings: Finding[]; defaultListing?: string }) {
  const assessed = findings.filter((f) => f.claim);
  return (
    <section id="claims" aria-labelledby="claims-title" className="card scroll-mt-6 overflow-hidden">
      <header className="border-b border-line px-5 py-4">
        <h2 id="claims-title" className="font-semibold">
          The seller&apos;s claims{assessed.length ? ` (${assessed.length})` : ""}
        </h2>
        <p className="mt-0.5 text-sm text-muted">What the seller says about the car. Each claim is checked against the documents and gets one status.</p>
      </header>
      {assessed.length > 0 && (
        <ul className="divide-y divide-line border-b border-line">
          {assessed.map((f) => {
            const info = f.claim!;
            const claim = c.claims?.find((x) => x.id === info.claimId);
            const src = f.evidence.find((e) => e.documentId && !(e.note ?? "").startsWith("Not used"));
            const href = src ? docHref(c.id, src) : null;
            return (
              <li key={f.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/cases/${c.id}/evidence#${f.id}`} className="text-sm font-semibold hover:underline">
                      {info.label}
                    </Link>
                    <StatusBadge status={f.status} size="sm" />
                  </div>
                  {claim?.sourceText ? (
                    <p className="mt-0.5 text-sm text-muted">
                      Seller wrote: <q className="italic">{claim.sourceText}</q>
                    </p>
                  ) : null}
                  {href && src ? (
                    <Link href={href} className="link text-xs">
                      Evidence: {src.documentName}
                      {src.page ? `, page ${src.page}` : ""}
                    </Link>
                  ) : info.missing ? (
                    <p className="text-xs text-muted">Missing: {info.missing}</p>
                  ) : null}
                </div>
                <WithdrawClaimButton caseId={c.id} claimId={info.claimId} label={info.label} />
              </li>
            );
          })}
        </ul>
      )}
      <details className="px-5 py-4" open={assessed.length === 0}>
        <summary className="cursor-pointer text-sm font-semibold text-brand-700">{assessed.length ? "Add or change claims" : "Add the seller's claims"}</summary>
        <div className="mt-3">
          <ClaimsEditor caseId={c.id} defaultListing={defaultListing} />
        </div>
      </details>
    </section>
  );
}
