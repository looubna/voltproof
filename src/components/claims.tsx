import Link from "next/link";
import { ClaimsEditor, WithdrawClaimButton } from "@/components/client";
import { StatusBadge, docHref } from "@/components/ui";
import { format } from "@/i18n/format";
import { rich } from "@/i18n/rich";
import { getI18n } from "@/i18n/server";
import type { FindingView } from "@/lib/localize";
import type { Case, Finding } from "@/lib/types";

/**
 * Step 2 of a review: what the seller says about the car, each claim with its
 * status, and the editor to add, change or withdraw claims. What to do about
 * each claim is in the case's "Before you make an offer" box.
 */
export async function SellerClaims({ c, findings, view, defaultListing }: { c: Case; findings: Finding[]; view: FindingView; defaultListing?: string }) {
  const { m } = await getI18n();
  const t = m.claims;
  const assessed = findings.filter((f) => f.claim).map(view);
  return (
    <section id="claims" aria-labelledby="claims-title" className="card scroll-mt-6 overflow-hidden">
      <header className="border-b border-line px-5 py-4">
        <h2 id="claims-title" className="font-semibold">
          {assessed.length ? format(t.titleCount, { count: assessed.length }) : t.title}
        </h2>
        <p className="mt-0.5 text-sm text-muted">{t.body}</p>
      </header>
      {assessed.length > 0 && (
        <ul className="divide-y divide-line border-b border-line">
          {assessed.map((f) => {
            const info = f.claim!;
            const claim = c.claims?.find((x) => x.id === info.claimId);
            const src = f.evidence.find((e) => e.documentId && !e.excluded);
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
                  {claim?.sourceText ? <p className="mt-0.5 text-sm text-muted">{rich(t.sellerWrote, { quote: <q className="italic">{claim.sourceText}</q> })}</p> : null}
                  {href && src ? (
                    <Link href={href} className="link text-xs">
                      {format(src.page ? t.evidencePage : t.evidence, { doc: src.documentName, page: src.page ?? "" })}
                    </Link>
                  ) : info.missing ? (
                    <p className="text-xs text-muted">{format(t.missing, { what: info.missing })}</p>
                  ) : null}
                </div>
                <WithdrawClaimButton caseId={c.id} claimId={info.claimId} label={info.label} copy={{ ...t.withdraw, cancel: m.common.cancel, requestFailed: m.errors.requestFailed }} />
              </li>
            );
          })}
        </ul>
      )}
      <details className="px-5 py-4" open={assessed.length === 0}>
        <summary className="cursor-pointer text-sm font-semibold text-brand-700">{assessed.length ? t.addOrChange : t.add}</summary>
        <div className="mt-3">
          <ClaimsEditor caseId={c.id} defaultListing={defaultListing} copy={{ ...t.editor, types: m.labels.claimType, requestFailed: m.errors.requestFailed }} />
        </div>
      </details>
    </section>
  );
}
