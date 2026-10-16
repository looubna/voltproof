import Link from "next/link";
import { AddDocuments, ClaimsEditor, VinDecodeButton } from "@/components/client";
import { car365Status, CAR365_NAME } from "@/lib/registry/car365";
import { ClaimsCard } from "@/components/claims";
import { AgentCard } from "@/components/agent";
import { agentConfigured } from "@/lib/agent";
import { SAMPLE_CASES } from "@/lib/samples/definitions";
import { CaseHeader, loadCase } from "@/components/case-header";
import { StatusBadge, DateTime } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { currentFindings, decisionImpactItems } from "@/lib/derive";
import { DOC_TYPE_LABEL, EXTRACTION_STATUS_LABEL, PROVENANCE_LABEL, RESOLUTION_LABEL } from "@/lib/labels";
import type { Case, ExtractionStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const SUMMARY_ORDER = ["vin-consistency", "vin-structure", "registration-consistency", "vehicle-consistency", "mileage-timeline", "current-odometer", "date-consistency", "battery-health", "battery-report-vin", "battery-report-age"];

function DecisionImpact({ c }: { c: Case }) {
  const { open, resolved } = decisionImpactItems(c);
  return (
    <section className="overflow-hidden rounded-xl border border-navy-900 bg-[#fdfcfa]">
      <header className="bg-navy-950 px-5 py-4 text-white">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">
            <span className="text-amber-300">Decision impact:</span>{" "}
            {open.length === 0 ? "no open items" : `${open.length} item${open.length === 1 ? "" : "s"} to check before an offer`}
          </h2>
          {open.length > 0 && (
            <Link href={`/review?case=${c.id}`} className="text-sm text-white/80 underline-offset-2 hover:underline">
              Open review queue →
            </Link>
          )}
        </div>
        <p className="mt-1 text-xs text-white/70">Open issues that could change the purchase. VoltProof assigns no price, valuation or fraud probability.</p>
      </header>
      {open.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted">
          {c.documents.length === 0 ? "Upload documents to start the review." : "Nothing currently affects the decision. Authenticity is still not verified; see the report for limitations."}
        </p>
      ) : (
        <ol className="divide-y divide-line">
          {open.map(({ finding: f, review }) => (
            <li key={f.id} className="grid gap-2 px-5 py-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">{f.title}</h3>
                <StatusBadge status={f.status} detail={f.status === "conflict" ? "awaiting human review" : review.latest ? RESOLUTION_LABEL[review.latest.resolution].toLowerCase() : undefined} />
              </div>
              <dl className="grid gap-2 sm:grid-cols-[110px_1fr]">
                <dt className="label pt-0.5">Evidence</dt>
                <dd>{f.result}</dd>
                <dt className="label pt-0.5">Why it matters</dt>
                <dd>{f.whyItMatters}</dd>
                <dt className="label pt-0.5">Next action</dt>
                <dd className="font-medium">{f.nextAction}</dd>
              </dl>
              {review.latest ? (
                <p className="text-xs text-muted">
                  Last review: {RESOLUTION_LABEL[review.latest.resolution]} by {review.latest.reviewer} — “{review.latest.note}”
                  {review.stale ? " (evidence changed since)" : ""}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      )}
      {resolved.length > 0 && (
        <details className="border-t border-line px-5 py-3 text-sm">
          <summary className="cursor-pointer text-muted">{resolved.length} item{resolved.length === 1 ? "" : "s"} resolved by a reviewer</summary>
          <ul className="mt-2 grid gap-2">
            {resolved.map(({ finding: f, review }) => (
              <li key={f.id} className="flex flex-wrap items-center gap-2">
                <StatusBadge status={f.status} size="sm" detail="resolved" />
                <span className="font-medium">{f.title}</span>
                <span className="text-muted">— {review.latest?.reviewer}: “{review.latest?.note}”</span>
              </li>
            ))}
          </ul>
        </details>
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

  return (
    <>
      <CaseHeader c={c} active="overview" />
      {c.synthetic && (
        <p className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          Synthetic demonstration case. All documents, VINs and companies are fictional. Extractions come from hand-written demo fixtures, not a live AI call.
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="grid content-start gap-6">
          <ClaimsCard c={c} findings={findings} editable />
          <details className="card px-5 py-4" open={!(c.claims ?? []).some((x) => !x.withdrawn)}>
            <summary className="cursor-pointer text-sm font-semibold">Add or update seller claims</summary>
            <div className="mt-3">
              <ClaimsEditor caseId={c.id} defaultListing={SAMPLE_CASES.find((s) => s.id === c.id)?.listing} />
            </div>
          </details>
          <AgentCard c={c} configured={agentConfigured()} />
          <DecisionImpact c={c} />

          <section className="card overflow-hidden">
            <header className="flex items-center justify-between border-b border-line px-5 py-3">
              <h2 className="font-semibold">Check summary</h2>
              <Link href={`/cases/${c.id}/evidence`} className="link text-sm">
                See evidence →
              </Link>
            </header>
            <ul className="divide-y divide-line">
              {SUMMARY_ORDER.map((fid) => byId.get(fid)).filter(Boolean).map((f) => (
                <li key={f!.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                  <Link href={`/cases/${c.id}/evidence#${f!.id}`} className="hover:underline">
                    {f!.title}
                  </Link>
                  <StatusBadge status={f!.status} />
                </li>
              ))}
              <li className="flex flex-wrap items-center justify-between gap-2 bg-canvas px-5 py-3 text-sm">
                <Link href={`/cases/${c.id}/evidence#authenticity`} className="hover:underline">
                  Document authenticity
                </Link>
                <StatusBadge status="unknown" detail="not verified" />
              </li>
            </ul>
          </section>
        </div>

        <aside className="grid content-start gap-6">
          <section className="card p-5 text-sm">
            <h2 className="mb-3 font-semibold">Vehicle</h2>
            <dl className="grid grid-cols-[90px_1fr] gap-y-1.5">
              <dt className="text-muted">Make</dt>
              <dd>{c.vehicle.make}</dd>
              <dt className="text-muted">Model</dt>
              <dd>{c.vehicle.model}</dd>
              <dt className="text-muted">Year</dt>
              <dd>{c.vehicle.year ?? "—"}</dd>
              <dt className="text-muted">VIN</dt>
              <dd className="break-all font-mono">{c.vehicle.vin || "—"}</dd>
              <dt className="text-muted">VIN check</dt>
              <dd>
                {(() => {
                  const f = byId.get("vin-structure");
                  const decode = [...(c.registryChecks ?? [])].reverse().find((r) => r.kind === "vin_decode");
                  const nz = [...(c.registryChecks ?? [])].reverse().find((r) => r.kind === "register_match");
                  return (
                    <div className="grid gap-1.5">
                      {f ? <StatusBadge status={f.status} size="sm" /> : null}
                      {decode ? (
                        <span className="text-xs text-muted">
                          {decode.outcome === "ok" ? `NHTSA: ${[decode.data.modelYear, decode.data.make, decode.data.model].filter(Boolean).join(" ")}${decode.data.electrification ? `, ${decode.data.electrification}` : ""}${decode.data.plantCountry ? `, built in ${decode.data.plantCountry.toLowerCase()}` : ""}` : `NHTSA: ${decode.message}`}
                        </span>
                      ) : null}
                      {nz ? <span className="text-xs text-muted">NZ register: {nz.message}</span> : null}
                      {c.vehicle.vin ? <VinDecodeButton caseId={c.id} /> : null}
                      {c.vehicle.vin ? <VinDecodeButton caseId={c.id} provider="nzta_mvr" label="Check NZ vehicle register" /> : null}
                    </div>
                  );
                })()}
              </dd>
              <dt className="text-muted">Registries</dt>
              <dd className="text-xs text-muted">
                <div>NZ Motor Vehicle Register (open data): connected, VIN prefix only</div>
                <div title={car365Status(process.env.KR_CAR365_SERVICE_KEY).message}>
                  {CAR365_NAME}: {car365Status(process.env.KR_CAR365_SERVICE_KEY).configured ? "connected" : "not connected"}
                </div>
              </dd>
              <dt className="text-muted">Opened</dt>
              <dd>
                <DateTime iso={c.createdAt} /> by {c.createdBy}
              </dd>
            </dl>
          </section>

          <section className="card">
            <h2 className="border-b border-line px-5 py-3 font-semibold">Documents</h2>
            {c.documents.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted">No documents yet.</p>
            ) : (
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
                        {d.extraction ? <span className="font-normal text-muted"> · {d.extraction.mode === "demo-fixture" ? "demo fixture" : d.extraction.model}</span> : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="border-t border-line p-4">
              <div className="label mb-2">Add documents</div>
              <AddDocuments caseId={c.id} maxMb={Math.round(cfg.maxUploadBytes / 1048576)} />
            </div>
          </section>

          <section className="card">
            <h2 className="border-b border-line px-5 py-3 font-semibold">History</h2>
            <ol className="max-h-96 divide-y divide-line overflow-y-auto">
              {[...c.events].reverse().map((e, i) => (
                <li key={i} className="px-5 py-2.5 text-xs">
                  <div className="text-muted">
                    <DateTime iso={e.at} /> · {e.actor}
                  </div>
                  <div className="mt-0.5 text-ink">{e.detail}</div>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </>
  );
}
