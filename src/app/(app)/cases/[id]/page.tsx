import Link from "next/link";
import { AgentCard } from "@/components/agent";
import { CaseHeader, loadCase } from "@/components/case-header";
import { CaseSteps } from "@/components/case-steps";
import { SellerClaims } from "@/components/claims";
import { AddDocuments, ReferenceEditor, VinDecodeButton } from "@/components/client";
import { DateTime, StatusBadge, StatusKey } from "@/components/ui";
import { agentConfigured } from "@/lib/agent";
import { requireUser } from "@/lib/auth";
import { claimSummaryLine } from "@/lib/claims/assess";
import { getConfig, typicalReadSeconds } from "@/lib/config";
import { currentFindings, decisionImpactItems } from "@/lib/derive";
import { historyEntry } from "@/lib/history";
import { DOC_TYPE_LABEL, EXTRACTION_STATUS_LABEL, PROVENANCE_LABEL, RESOLUTION_LABEL } from "@/lib/labels";
import { CAR365_NAME, car365Status } from "@/lib/registry/car365";
import { SAMPLE_CASES } from "@/lib/samples/definitions";
import type { Case, ExtractionStatus, Finding } from "@/lib/types";

export const dynamic = "force-dynamic";

const SUMMARY_ORDER = ["vin-consistency", "vin-structure", "registration-consistency", "vehicle-consistency", "mileage-timeline", "current-odometer", "date-consistency", "battery-health", "battery-report-vin", "battery-report-age"];

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** The one place to act: what to check before an offer, what is backed by evidence, what was resolved. */
function BeforeYouOffer({ c, findings }: { c: Case; findings: Finding[] }) {
  const { open, resolved } = decisionImpactItems(c);
  const claims = findings.filter((f) => f.claim);
  const backed = claims.filter((f) => f.status === "verified" || f.status === "consistent");
  const summary = claimSummaryLine(claims);
  const hasDocs = c.documents.length > 0;
  const attention = open.length ? `${plural(open.length, "item")} below ${open.length === 1 ? "needs" : "need"} your attention.` : "Nothing open affects the decision.";
  return (
    <section aria-labelledby="offer-title" className="overflow-hidden rounded-xl border border-navy-900 bg-[#fdfcfa]">
      <header className="bg-navy-950 px-5 py-4 text-white">
        <h2 id="offer-title" className="text-lg font-semibold">
          Before you make an offer
        </h2>
        <p className="mt-1 text-base font-medium text-white">{hasDocs ? (summary ?? attention) : "Upload the seller's documents to start."}</p>
        {hasDocs && summary ? <p className="mt-0.5 text-sm text-white/75">{attention}</p> : null}
        <p className="mt-2 text-xs text-white/65">VoltProof shows what the evidence supports. It does not price the car or decide whether it is fraud.</p>
      </header>

      {!hasDocs ? (
        <p className="px-5 py-5 text-sm text-muted">Nothing to check yet. Upload the documents (step 1), then add what the seller claims (step 2).</p>
      ) : (
        <>
          {open.length > 0 && (
            <div>
              <h3 className="label px-5 pt-4">Check first</h3>
              <ol className="divide-y divide-line">
                {open.map(({ finding: f, review }) => (
                  <li key={f.id} className="px-5 py-4 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="font-semibold text-ink">{f.title}</h4>
                      <StatusBadge status={f.status} detail={review.latest ? RESOLUTION_LABEL[review.latest.resolution].toLowerCase() : f.status === "conflict" ? "needs your review" : undefined} />
                    </div>
                    {f.claim ? <p className="mt-1">{f.claim.headline}</p> : null}
                    <p className="mt-1">
                      <span className="font-semibold">Next step:</span> {f.nextAction ?? "Look at the evidence and record your decision."}
                    </p>
                    {review.latest ? (
                      <p className="mt-1 text-xs text-muted">
                        Last review: {RESOLUTION_LABEL[review.latest.resolution]} by {review.latest.reviewer}, “{review.latest.note}”
                        {review.stale ? ". The evidence changed since, so it is open again." : ""}
                      </p>
                    ) : null}
                    <details className="mt-2">
                      <summary className="cursor-pointer font-medium text-brand-700">Why it matters and what was found</summary>
                      <p className="mt-2">{f.result}</p>
                      <p className="mt-1 text-muted">{f.whyItMatters}</p>
                      <Link href={`/cases/${c.id}/evidence#${f.id}`} className="link mt-1 inline-block">
                        See the evidence →
                      </Link>
                    </details>
                  </li>
                ))}
              </ol>
              <div className="border-t border-line px-5 py-3">
                <Link href={`/review?case=${c.id}`} className="btn btn-primary">
                  Record your decisions →
                </Link>
              </div>
            </div>
          )}
          {open.length === 0 && <p className="px-5 py-4 text-sm text-muted">Nothing currently affects the decision. Documents are still not confirmed with their issuers; the report explains the limits.</p>}

          {backed.length > 0 && (
            <div className="border-t border-line">
              <h3 className="label px-5 pt-4">Backed by evidence</h3>
              <ul className="divide-y divide-line">
                {backed.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-start justify-between gap-2 px-5 py-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{f.claim!.label}</p>
                      <p className="text-muted">{f.claim!.headline}</p>
                    </div>
                    <StatusBadge status={f.status} size="sm" />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {resolved.length > 0 && (
            <details className="border-t border-line px-5 py-3 text-sm">
              <summary className="cursor-pointer text-muted">{plural(resolved.length, "item")} resolved by a reviewer</summary>
              <ul className="mt-2 grid gap-2">
                {resolved.map(({ finding: f, review }) => (
                  <li key={f.id} className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={f.status} size="sm" detail="resolved" />
                    <span className="font-medium">{f.title}</span>
                    <span className="text-muted">
                      {review.latest?.reviewer}: “{review.latest?.note}”
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}

const EX_STATUS_CLASS: Record<ExtractionStatus, string> = {
  pending: "text-muted",
  processing: "text-brand-600",
  extracted: "text-verified-fg",
  failed: "text-red-700",
  not_configured: "text-conflict-fg",
};

export default async function CaseOverview({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const c = await loadCase(id);
  const findings = currentFindings(c);
  const byId = new Map(findings.map((f) => [f.id, f]));
  const cfg = getConfig();
  const maxMb = Math.round(cfg.maxUploadBytes / 1048576);
  const hasDocs = c.documents.length > 0;
  const upload = <AddDocuments caseId={c.id} maxMb={maxMb} typicalSeconds={typicalReadSeconds(cfg)} />;
  const history = [...c.events].reverse().map(historyEntry);
  const checks = SUMMARY_ORDER.map((fid) => byId.get(fid)).filter((f): f is Finding => !!f);

  return (
    <>
      <CaseHeader c={c} active="overview" />
      {c.synthetic && (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          Demo case: the documents, VINs and companies are fictional.
          <span className="tech-detail"> Values come from hand-written demo fixtures, not a live AI call.</span>
        </p>
      )}
      <CaseSteps c={c} />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="grid min-w-0 content-start gap-6">
          {!hasDocs && (
            <section id="upload" aria-labelledby="upload-title" className="card scroll-mt-6 p-5">
              <h2 id="upload-title" className="text-lg font-semibold">
                Start here: upload the seller&apos;s documents
              </h2>
              <p className="mb-4 mt-1 text-sm text-muted">
                The registration, service invoices, a battery report and a photo of the dashboard help most. VoltProof reads each one and checks the facts against each other.
              </p>
              {upload}
            </section>
          )}
          <BeforeYouOffer c={c} findings={findings} />
          <StatusKey />
          <SellerClaims c={c} findings={findings} defaultListing={SAMPLE_CASES.find((s) => s.id === c.id)?.listing} />
          <AgentCard c={c} configured={agentConfigured()} />
          {checks.length > 0 && (
            <details className="card overflow-hidden">
              <summary className="cursor-pointer px-5 py-3 font-semibold">All checks on this case ({checks.length + 1})</summary>
              <ul className="divide-y divide-line border-t border-line">
                {checks.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                    <Link href={`/cases/${c.id}/evidence#${f.id}`} className="hover:underline">
                      {f.title}
                    </Link>
                    <StatusBadge status={f.status} />
                  </li>
                ))}
                <li className="flex flex-wrap items-center justify-between gap-2 bg-canvas px-5 py-3 text-sm">
                  <Link href={`/cases/${c.id}/evidence#authenticity`} className="hover:underline">
                    Documents confirmed with their issuers
                  </Link>
                  <StatusBadge status={byId.get("authenticity")?.status ?? "unknown"} detail={byId.get("authenticity")?.status === "verified" ? undefined : "not yet"} />
                </li>
              </ul>
            </details>
          )}
        </div>

        <aside className="grid min-w-0 content-start gap-6">
          <section className="card p-5 text-sm">
            <h2 className="mb-3 font-semibold">Vehicle</h2>
            <dl className="grid grid-cols-[96px_1fr] gap-y-2">
              <dt className="text-muted">Make</dt>
              <dd>{c.vehicle.make}</dd>
              <dt className="text-muted">Model</dt>
              <dd>{c.vehicle.model}</dd>
              <dt className="text-muted">Year</dt>
              <dd>{c.vehicle.year ?? "—"}</dd>
              <dt className="text-muted">VIN</dt>
              <dd className={c.vehicle.vin ? "break-all font-mono" : "text-muted"}>{c.vehicle.vin || "Not entered"}</dd>
              <dt className="text-muted">VIN check</dt>
              <dd>
                {(() => {
                  const f = byId.get("vin-structure");
                  const decode = [...(c.registryChecks ?? [])].reverse().find((r) => r.kind === "vin_decode");
                  const nz = [...(c.registryChecks ?? [])].reverse().find((r) => r.kind === "register_match");
                  return (
                    <div className="grid gap-1.5">
                      {f ? <StatusBadge status={f.status} size="sm" /> : null}
                      {f && f.status !== "verified" && f.nextAction ? <span className="text-xs text-muted">{f.nextAction}</span> : null}
                      {decode ? (
                        <span className="text-xs text-muted">
                          US VIN database:{" "}
                          {decode.outcome === "ok"
                            ? `${[decode.data.modelYear, decode.data.make, decode.data.model].filter(Boolean).join(" ")}${decode.data.electrification ? `, ${decode.data.electrification}` : ""}${decode.data.plantCountry ? `, built in ${decode.data.plantCountry.toLowerCase()}` : ""}`
                            : decode.message}
                        </span>
                      ) : null}
                      {nz ? <span className="text-xs text-muted">NZ register: {nz.message}</span> : null}
                      {c.vehicle.vin ? <VinDecodeButton caseId={c.id} label="Look up VIN (US)" /> : null}
                      {c.vehicle.vin ? <VinDecodeButton caseId={c.id} provider="nzta_mvr" label="Check NZ register" /> : null}
                    </div>
                  );
                })()}
              </dd>
              <dt className="text-muted">Your reference</dt>
              <dd>
                <ReferenceEditor caseId={c.id} value={c.reference ?? null} />
              </dd>
              <dt className="text-muted">Opened</dt>
              <dd>
                <DateTime iso={c.createdAt} /> by {c.synthetic && c.createdBy === "VoltProof demo seed" ? "demo setup" : c.createdBy}
              </dd>
              <dt className="tech-detail text-muted">Registries</dt>
              <dd className="tech-detail text-xs text-muted">
                <div>NZ Motor Vehicle Register (open data): connected, VIN prefix only</div>
                <div>
                  {CAR365_NAME}: {car365Status(process.env.KR_CAR365_SERVICE_KEY).configured ? "connected" : "not connected"}
                </div>
              </dd>
            </dl>
          </section>

          {hasDocs && (
            <section id="upload" aria-labelledby="docs-title" className="card scroll-mt-6">
              <h2 id="docs-title" className="border-b border-line px-5 py-3 font-semibold">
                Documents ({c.documents.length})
              </h2>
              <ul className="divide-y divide-line">
                {c.documents.map((d) => {
                  const t = d.extraction?.fields.documentType.value;
                  return (
                    <li key={d.id} className="px-5 py-3 text-sm">
                      <Link href={`/cases/${c.id}/documents/${d.id}`} className="link break-all font-medium">
                        {d.filename}
                      </Link>
                      <div className="mt-0.5 text-xs text-muted">
                        {t ? DOC_TYPE_LABEL[t] : "Type not determined"} · {PROVENANCE_LABEL[d.provenance]}
                      </div>
                      <div className={`mt-0.5 text-xs font-medium ${EX_STATUS_CLASS[d.extractionStatus]}`}>
                        {EXTRACTION_STATUS_LABEL[d.extractionStatus]}
                        {d.extraction ? <span className="tech-detail font-normal text-muted"> · {d.extraction.mode === "demo-fixture" ? "demo fixture" : d.extraction.model}</span> : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="border-t border-line p-4">
                <h3 className="label mb-2">Add documents</h3>
                {upload}
              </div>
            </section>
          )}

          <section aria-labelledby="history-title" className="card">
            <div className="border-b border-line px-5 py-3">
              <h2 id="history-title" className="font-semibold">
                History
              </h2>
              <p className="text-xs text-muted">
                Everything people and the agent did. <span className="tech-hide">Automatic check updates appear with Technical details on.</span>
              </p>
            </div>
            <ol className="max-h-96 divide-y divide-line overflow-y-auto" tabIndex={0} aria-label="Case history, newest first">
              {history.map((e, i) => (
                <li key={i} className={`px-5 py-2.5 text-xs ${e.automatic ? "tech-detail" : ""}`}>
                  <div className="text-muted">
                    <DateTime iso={e.at} /> · {e.who}
                  </div>
                  <div className="mt-0.5 text-sm text-ink">{e.text}</div>
                  {e.technical ? <div className="tech-detail mt-0.5 font-mono text-xs text-muted">{e.technical}</div> : null}
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </>
  );
}
