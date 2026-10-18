import Link from "next/link";
import { AgentCard } from "@/components/agent";
import { CaseHeader, loadCase } from "@/components/case-header";
import { CaseSteps } from "@/components/case-steps";
import { SellerClaims } from "@/components/claims";
import { AddDocuments, ReferenceEditor, VinDecodeButton, type UploadCopy } from "@/components/client";
import { DateTime, StatusBadge, StatusKey } from "@/components/ui";
import { format, formatPlural } from "@/i18n/format";
import { rich } from "@/i18n/rich";
import { RULE_TEXT } from "@/i18n/rules";
import { getI18n } from "@/i18n/server";
import { agentConfigured } from "@/lib/agent";
import { requireUser } from "@/lib/auth";
import { claimSummaryLine } from "@/lib/claims/assess";
import { getConfig, typicalReadSeconds } from "@/lib/config";
import { currentFindings, decisionImpactItems } from "@/lib/derive";
import { actorName, historyEntryIn } from "@/lib/history";
import { findingView, titleTranslator, type FindingView } from "@/lib/localize";
import { CAR365_NAME, car365Status } from "@/lib/registry/car365";
import { SAMPLE_CASES } from "@/lib/samples/definitions";
import type { Case, ExtractionStatus, Finding } from "@/lib/types";

export const dynamic = "force-dynamic";

const SUMMARY_ORDER = ["vin-consistency", "vin-structure", "registration-consistency", "vehicle-consistency", "mileage-timeline", "current-odometer", "date-consistency", "battery-health", "battery-report-vin", "battery-report-age"];

/** The one place to act: what to check before an offer, what is backed by evidence, what was resolved. */
async function BeforeYouOffer({ c, findings, view }: { c: Case; findings: Finding[]; view: FindingView }) {
  const { locale, m } = await getI18n();
  const t = m.overview.offer;
  const { open, resolved } = decisionImpactItems(c);
  const claims = findings.filter((f) => f.claim);
  const backed = claims.filter((f) => f.status === "verified" || f.status === "consistent");
  // Decided from the stored findings' statuses; only the wording is in the reader's language.
  const summary = claimSummaryLine(claims, RULE_TEXT[locale]);
  const hasDocs = c.documents.length > 0;
  const attention = open.length ? formatPlural(locale, t.attention, open.length) : t.nothingOpen;
  const english = (f: { lang: string }) => (f.lang !== locale ? f.lang : undefined);
  return (
    <section aria-labelledby="offer-title" className="overflow-hidden rounded-xl border border-navy-900 bg-[#fdfcfa]">
      <header className="bg-navy-950 px-5 py-4 text-white">
        <h2 id="offer-title" className="text-lg font-semibold">
          {t.title}
        </h2>
        <p className="mt-1 text-base font-medium text-white">{hasDocs ? (summary ?? attention) : t.uploadFirst}</p>
        {hasDocs && summary ? <p className="mt-0.5 text-sm text-white/75">{attention}</p> : null}
        <p className="mt-2 text-xs text-white/65">{t.scope}</p>
      </header>

      {!hasDocs ? (
        <p className="px-5 py-5 text-sm text-muted">{t.nothingYet}</p>
      ) : (
        <>
          {open.length > 0 && (
            <div>
              <h3 className="label px-5 pt-4">{t.checkFirst}</h3>
              <ol className="divide-y divide-line">
                {open.map(({ finding, review }) => {
                  const f = view(finding);
                  return (
                    <li key={f.id} className="px-5 py-4 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h4 lang={english(f)} className="font-semibold text-ink">
                          {f.title}
                        </h4>
                        <StatusBadge status={f.status} detail={review.latest ? m.labels.resolution[review.latest.resolution].toLowerCase() : f.status === "conflict" ? t.needsReview : undefined} />
                      </div>
                      {f.claim ? (
                        <p lang={english(f)} className="mt-1">
                          {f.claim.headline}
                        </p>
                      ) : null}
                      <p className="mt-1">
                        <span className="font-semibold">{t.nextStep}</span> <span lang={f.nextAction ? english(f) : undefined}>{f.nextAction ?? t.nextStepDefault}</span>
                      </p>
                      {review.latest ? (
                        <p className="mt-1 text-xs text-muted">
                          {format(t.lastReview, { resolution: m.labels.resolution[review.latest.resolution], reviewer: review.latest.reviewer, note: review.latest.note })}
                          {review.stale ? t.stale : ""}
                        </p>
                      ) : null}
                      <details className="mt-2">
                        <summary className="cursor-pointer font-medium text-brand-700">{t.whyFound}</summary>
                        <p lang={english(f)} className="mt-2">
                          {f.result}
                        </p>
                        <p lang={english(f)} className="mt-1 text-muted">
                          {f.whyItMatters}
                        </p>
                        <Link href={`/cases/${c.id}/evidence#${f.id}`} className="link mt-1 inline-block">
                          {t.seeEvidence}
                        </Link>
                      </details>
                    </li>
                  );
                })}
              </ol>
              <div className="border-t border-line px-5 py-3">
                <Link href={`/review?case=${c.id}`} className="btn btn-primary">
                  {t.record}
                </Link>
              </div>
            </div>
          )}
          {open.length === 0 && <p className="px-5 py-4 text-sm text-muted">{t.nothingAffects}</p>}

          {backed.length > 0 && (
            <div className="border-t border-line">
              <h3 className="label px-5 pt-4">{t.backed}</h3>
              <ul className="divide-y divide-line">
                {backed.map(view).map((f) => (
                  <li key={f.id} className="flex flex-wrap items-start justify-between gap-2 px-5 py-3 text-sm">
                    <div lang={english(f)} className="min-w-0 flex-1">
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
              <summary className="cursor-pointer text-muted">{formatPlural(locale, t.resolvedCount, resolved.length)}</summary>
              <ul className="mt-2 grid gap-2">
                {resolved.map(({ finding, review }) => {
                  const f = view(finding);
                  return (
                    <li key={f.id} className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={f.status} size="sm" detail={t.resolved} />
                      <span lang={english(f)} className="font-medium">
                        {f.title}
                      </span>
                      <span className="text-muted">
                        {review.latest?.reviewer}: “{review.latest?.note}”
                      </span>
                    </li>
                  );
                })}
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
  const { locale, m } = await getI18n();
  const t = m.overview;
  const c = await loadCase(id);
  const findings = currentFindings(c);
  const view = findingView(c, locale);
  const byId = new Map(findings.map((f) => [f.id, f]));
  const cfg = getConfig();
  const maxMb = Math.round(cfg.maxUploadBytes / 1048576);
  const hasDocs = c.documents.length > 0;
  const uploadCopy: UploadCopy = {
    ...m.upload,
    provenance: m.labels.provenance,
    remove: m.common.remove,
    working: m.common.working,
    updating: m.common.updating,
    seconds: m.common.seconds,
    requestFailed: m.errors.requestFailed,
  };
  const upload = <AddDocuments caseId={c.id} maxMb={maxMb} typicalSeconds={typicalReadSeconds(cfg)} copy={uploadCopy} />;
  const title = titleTranslator(c, view);
  const history = [...c.events].reverse().map((e) => historyEntryIn(e, locale, title));
  const checks = SUMMARY_ORDER.map((fid) => byId.get(fid)).filter((f): f is Finding => !!f);
  const authenticity = byId.get("authenticity");

  return (
    <>
      <CaseHeader c={c} active="overview" />
      {c.synthetic && (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          {t.demoNote}
          <span className="tech-detail">{t.demoNoteTech}</span>
        </p>
      )}
      <CaseSteps c={c} />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="grid min-w-0 content-start gap-6">
          {!hasDocs && (
            <section id="upload" aria-labelledby="upload-title" className="card scroll-mt-6 p-5">
              <h2 id="upload-title" className="text-lg font-semibold">
                {t.startTitle}
              </h2>
              <p className="mb-4 mt-1 text-sm text-muted">{t.startBody}</p>
              {upload}
            </section>
          )}
          <BeforeYouOffer c={c} findings={findings} view={view} />
          <StatusKey />
          <SellerClaims c={c} findings={findings} view={view} defaultListing={SAMPLE_CASES.find((s) => s.id === c.id)?.listing} />
          <AgentCard c={c} configured={agentConfigured()} view={view} />
          {checks.length > 0 && (
            <details className="card overflow-hidden">
              <summary className="cursor-pointer px-5 py-3 font-semibold">{format(t.allChecks, { count: checks.length + 1 })}</summary>
              <ul className="divide-y divide-line border-t border-line">
                {checks.map(view).map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                    <Link href={`/cases/${c.id}/evidence#${f.id}`} lang={f.lang !== locale ? f.lang : undefined} className="hover:underline">
                      {f.title}
                    </Link>
                    <StatusBadge status={f.status} />
                  </li>
                ))}
                <li className="flex flex-wrap items-center justify-between gap-2 bg-canvas px-5 py-3 text-sm">
                  <Link href={`/cases/${c.id}/evidence#authenticity`} className="hover:underline">
                    {t.issuers}
                  </Link>
                  <StatusBadge status={authenticity?.status ?? "unknown"} detail={authenticity?.status === "verified" ? undefined : t.notYet} />
                </li>
              </ul>
            </details>
          )}
        </div>

        <aside className="grid min-w-0 content-start gap-6">
          <section className="card p-5 text-sm">
            <h2 className="mb-3 font-semibold">{t.vehicle.title}</h2>
            {/* The label column fits its longest label, so longer languages never run into the values. */}
            <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-2">
              <dt className="text-muted">{t.vehicle.make}</dt>
              <dd>{c.vehicle.make}</dd>
              <dt className="text-muted">{t.vehicle.model}</dt>
              <dd>{c.vehicle.model}</dd>
              <dt className="text-muted">{t.vehicle.year}</dt>
              <dd>{c.vehicle.year ?? "—"}</dd>
              <dt className="text-muted">{t.vehicle.vin}</dt>
              <dd className={c.vehicle.vin ? "break-all font-mono" : "text-muted"}>{c.vehicle.vin || m.common.notEntered}</dd>
              <dt className="text-muted">{t.vehicle.vinCheck}</dt>
              <dd>
                {(() => {
                  const stored = byId.get("vin-structure");
                  const f = stored ? view(stored) : null;
                  const decode = [...(c.registryChecks ?? [])].reverse().find((r) => r.kind === "vin_decode");
                  const nz = [...(c.registryChecks ?? [])].reverse().find((r) => r.kind === "register_match");
                  const lookup = { checking: m.common.checking, requestFailed: m.errors.requestFailed };
                  return (
                    <div className="grid gap-1.5">
                      {f ? <StatusBadge status={f.status} size="sm" /> : null}
                      {f && f.status !== "verified" && f.nextAction ? (
                        <span lang={f.lang !== locale ? f.lang : undefined} className="text-xs text-muted">
                          {f.nextAction}
                        </span>
                      ) : null}
                      {/* What the outside services returned is shown as received. */}
                      {decode ? (
                        <span className="text-xs text-muted">
                          {t.vehicle.usDatabase}{" "}
                          {decode.outcome === "ok" ? (
                            <>
                              {[decode.data.modelYear, decode.data.make, decode.data.model].filter(Boolean).join(" ")}
                              {decode.data.electrification ? `, ${decode.data.electrification}` : ""}
                              {decode.data.plantCountry ? `, ${format(t.vehicle.builtIn, { country: decode.data.plantCountry.toLowerCase() })}` : ""}
                            </>
                          ) : (
                            <span lang="en">{decode.message}</span>
                          )}
                        </span>
                      ) : null}
                      {nz ? (
                        <span className="text-xs text-muted">
                          {t.vehicle.nzLabel} <span lang="en">{nz.message}</span>
                        </span>
                      ) : null}
                      {c.vehicle.vin ? <VinDecodeButton caseId={c.id} label={t.vehicle.lookUpUs} copy={lookup} /> : null}
                      {c.vehicle.vin ? <VinDecodeButton caseId={c.id} provider="nzta_mvr" label={t.vehicle.checkNz} copy={lookup} /> : null}
                    </div>
                  );
                })()}
              </dd>
              <dt className="text-muted">{t.vehicle.reference}</dt>
              <dd>
                <ReferenceEditor
                  caseId={c.id}
                  value={c.reference ?? null}
                  copy={{ ...m.reference, save: m.common.save, saving: m.common.saving, cancel: m.common.cancel, requestFailed: m.errors.requestFailed }}
                />
              </dd>
              <dt className="text-muted">{t.vehicle.opened}</dt>
              <dd>
                {rich(format(t.vehicle.openedBy, { who: actorName(c.createdBy, locale) }), { date: <DateTime iso={c.createdAt} /> })}
              </dd>
              <dt className="tech-detail text-muted">{t.vehicle.registries}</dt>
              <dd className="tech-detail text-xs text-muted">
                <div>{t.vehicle.nzRegister}</div>
                <div>
                  {CAR365_NAME}: {car365Status(process.env.KR_CAR365_SERVICE_KEY).configured ? t.vehicle.connected : t.vehicle.notConnected}
                </div>
              </dd>
            </dl>
          </section>

          {hasDocs && (
            <section id="upload" aria-labelledby="docs-title" className="card scroll-mt-6">
              <h2 id="docs-title" className="border-b border-line px-5 py-3 font-semibold">
                {format(t.documents.title, { count: c.documents.length })}
              </h2>
              <ul className="divide-y divide-line">
                {c.documents.map((d) => {
                  const type = d.extraction?.fields.documentType.value;
                  return (
                    <li key={d.id} className="px-5 py-3 text-sm">
                      <Link href={`/cases/${c.id}/documents/${d.id}`} className="link break-all font-medium">
                        {d.filename}
                      </Link>
                      <div className="mt-0.5 text-xs text-muted">
                        {type ? m.labels.docType[type] : t.documents.typeUnknown} · {m.labels.provenance[d.provenance]}
                      </div>
                      <div className={`mt-0.5 text-xs font-medium ${EX_STATUS_CLASS[d.extractionStatus]}`}>
                        {m.labels.extraction[d.extractionStatus]}
                        {d.extraction ? <span className="tech-detail font-normal text-muted"> · {d.extraction.mode === "demo-fixture" ? t.documents.demoFixture : d.extraction.model}</span> : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="border-t border-line p-4">
                <h3 className="label mb-2">{t.documents.add}</h3>
                {upload}
              </div>
            </section>
          )}

          <section aria-labelledby="history-title" className="card">
            <div className="border-b border-line px-5 py-3">
              <h2 id="history-title" className="font-semibold">
                {t.history.title}
              </h2>
              <p className="text-xs text-muted">
                {t.history.body} <span className="tech-hide">{t.history.automatic}</span>
              </p>
            </div>
            <ol className="max-h-96 divide-y divide-line overflow-y-auto" tabIndex={0} aria-label={t.history.label}>
              {history.map((e, i) => (
                <li key={i} className={`px-5 py-2.5 text-xs ${e.automatic ? "tech-detail" : ""}`}>
                  <div className="text-muted">
                    <DateTime iso={e.at} /> · {e.who}
                  </div>
                  <div lang={e.lang} className="mt-0.5 text-sm text-ink">
                    {e.text}
                  </div>
                  {e.technical ? (
                    <div lang="en" className="tech-detail mt-0.5 font-mono text-xs text-muted">
                      {e.technical}
                    </div>
                  ) : null}
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </>
  );
}
