import Link from "next/link";
import { notFound } from "next/navigation";
import { DocumentSourceSelect, VerificationForm } from "@/components/client";
import { ForensicReportCard } from "@/components/forensic-report";
import { CaseHeader, loadCase } from "@/components/case-header";
import { DateTime } from "@/components/ui";
import { INTL_LOCALE } from "@/i18n/config";
import { format } from "@/i18n/format";
import { rich } from "@/i18n/rich";
import { RULE_TEXT } from "@/i18n/rules";
import { getI18n } from "@/i18n/server";
import { requireUser } from "@/lib/auth";
import { actorName } from "@/lib/history";
import { getConfig } from "@/lib/config";
import type { FieldName, Odometer } from "@/lib/types";

export const dynamic = "force-dynamic";

// What the file checks and forensic checks found is kept as they wrote it (in English): the
// messages describe the file and quote it. The labels around them are in the reader's language.

export default async function DocumentPage({ params, searchParams }: { params: Promise<{ id: string; docId: string }>; searchParams: Promise<{ page?: string; quote?: string }> }) {
  await requireUser();
  const { id, docId } = await params;
  const sp = await searchParams;
  const { locale, m } = await getI18n();
  const t = m.document;
  const c = await loadCase(id);
  const d = c.documents.find((x) => x.id === docId);
  if (!d) notFound();
  const page = Math.max(1, Number(sp.page) || 1);
  const quote = sp.quote?.slice(0, 300);
  const src = `/api/cases/${c.id}/documents/${d.id}/file`;
  const isPdf = d.mimeType === "application/pdf";
  const ex = d.extraction;
  const cfg = getConfig();
  const type = ex?.fields.documentType.value;

  return (
    <>
      <CaseHeader c={c} active="evidence" />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="break-all text-lg font-semibold">{d.filename}</h2>
          <p className="text-sm text-muted">
            {rich(format(t.meta, { type: type ? m.labels.docType[type] : m.overview.documents.typeUnknown, source: m.labels.provenance[d.provenance], who: actorName(d.uploadedBy, locale) }), {
              date: <DateTime iso={d.uploadedAt} />,
            })}
          </p>
        </div>
        <a href={src} target="_blank" rel="noreferrer" className="btn btn-secondary">
          {t.openOriginal}
        </a>
      </div>

      {(() => {
        const potential = (d.forensics?.indicators ?? []).filter((i) => i.severity === "potential");
        if (!potential.length) return null;
        const report = [...(c.agentRuns ?? [])].reverse().flatMap((r) => r.forensicReport ?? []).find((r) => r.documentId === d.id);
        return (
          <section className="mb-6 grid gap-3">
            <div className="rounded-xl border border-conflict-dot/40 bg-conflict-bg/30 px-5 py-4 text-sm">
              <div className="font-semibold text-conflict-fg">{format(t.edits.title, { count: potential.length })}</div>
              {locale !== "en" ? <p className="mt-1 text-xs text-muted">{t.asWritten}</p> : null}
              <ul className="mt-2 grid gap-1">
                {potential.map((i, k) => (
                  <li key={k}>
                    • <span lang="en">{i.message}</span>
                  </li>
                ))}
              </ul>
              {!report && (
                <p className="mt-2 text-xs text-muted">
                  {t.edits.runAgent}
                  <span className="tech-detail">{t.edits.runAgentTech}</span>
                </p>
              )}
            </div>
            {report ? (
              <ForensicReportCard c={c} report={report} showDocLink={false} />
            ) : d.forensics?.heatmapKey ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`${src}?view=heatmap`} alt={t.edits.heatmapAlt} className="max-h-80 rounded-lg border border-line" />
            ) : null}
          </section>
        );
      })()}
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="card overflow-hidden">
          {quote && (
            <div className="border-b border-line bg-conflict-bg/50 px-4 py-2 text-sm">
              <span className="font-medium">{format(t.lookFor, { page })}</span> <mark className="bg-amber-200/80 px-1 font-mono text-[13px]">{quote}</mark>
            </div>
          )}
          {isPdf ? (
            <iframe key={page} src={`${src}#page=${page}&view=FitH`} title={d.filename} className="h-[75vh] w-full bg-canvas" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt={format(t.imageAlt, { file: d.filename })} className="w-full bg-canvas object-contain" />
          )}
        </div>

        <aside className="grid content-start gap-4">
          <section className="card p-4">
            <div className="label mb-2">{t.extracted.title}</div>
            {!ex ? (
              <p className="text-sm text-muted">
                {m.labels.extraction[d.extractionStatus]}.{" "}
                {d.extractionStatus === "not_configured" ? m.upload.notConfigured : d.extractionError ? <span lang="en">{d.extractionError}</span> : null}
              </p>
            ) : (
              <>
                <p className="mb-2 text-xs text-muted">
                  {ex.mode === "demo-fixture" ? (
                    <>
                      {t.extracted.sample}
                      <span className="tech-detail">{t.extracted.sampleTech}</span>
                    </>
                  ) : (
                    <>
                      {rich(t.extracted.readOn, { date: <DateTime iso={ex.extractedAt} /> })}
                      <span className="tech-detail">
                        {rich(t.extracted.using, { model: <span className="font-mono">{ex.model}</span> })}
                        {/* The header names the model for new uploads; say so when this older reading used another one. */}
                        {cfg.aiMode === "vertex" && ex.model !== cfg.geminiModel ? format(t.extracted.newer, { model: cfg.geminiModel }) : null}
                      </span>
                    </>
                  )}
                </p>
                <ul className="grid gap-2 text-sm">
                  {(Object.keys(ex.fields) as FieldName[])
                    .filter((n) => ex.fields[n].value !== null)
                    .map((n) => {
                      const f = ex.fields[n];
                      const v = n === "odometer" ? RULE_TEXT[locale].odo(f.value as Odometer) : n === "documentType" ? m.labels.docType[f.value as keyof typeof m.labels.docType] : String(f.value);
                      const active = quote && f.quote === quote;
                      const q = new URLSearchParams({ page: String(f.page ?? 1), ...(f.quote ? { quote: f.quote } : {}) });
                      return (
                        <li key={n} className={`rounded-lg border px-3 py-2 ${active ? "border-amber-400 bg-amber-50" : "border-line"}`}>
                          <div className="flex justify-between gap-2 text-xs text-muted">
                            <span>{m.labels.field[n]}</span>
                            <Link className="link" href={`?${q}`}>
                              {format(t.extracted.page, { page: f.page ?? "?" })}
                            </Link>
                          </div>
                          <div className="font-mono text-[13px]">{v}</div>
                          {f.quote && <q className="text-xs italic text-muted">{f.quote}</q>}
                          {!f.supported && <div className="text-xs text-conflict-fg">{format(t.extracted.notUsed, { reason: RULE_TEXT[locale].reason(f.unsupportedReason ?? "") })}</div>}
                          {f.tamperIndicator && (
                            <div className="mt-1 rounded bg-conflict-bg px-2 py-1 text-xs text-conflict-fg">
                              {t.extracted.possibleEdit} <span lang="en">{f.tamperIndicator}</span>
                            </div>
                          )}
                        </li>
                      );
                    })}
                </ul>
              </>
            )}
          </section>
          <section className="card p-4 text-xs">
            <div className="label mb-2">{t.record.title}</div>
            <dl className="grid gap-1">
              <dt className="text-muted">{t.record.source}</dt>
              <dd>
                {c.synthetic ? (
                  m.labels.provenance[d.provenance]
                ) : (
                  <DocumentSourceSelect caseId={c.id} docId={d.id} value={d.provenance} copy={{ ...t.source, provenance: m.labels.provenance, requestFailed: m.errors.requestFailed }} />
                )}
                <p className="mt-0.5 text-muted">{t.record.sourceNote}</p>
              </dd>
              <dt className="mt-1 text-muted">{t.record.file}</dt>
              <dd>
                {d.integrity.detectedType.toUpperCase()} · {format(m.upload.size, { size: Math.round(d.sizeBytes / 1024).toLocaleString(INTL_LOCALE[locale]) })}
              </dd>
              <dt className="tech-detail mt-1 text-muted">{t.record.fingerprint}</dt>
              <dd className="tech-detail break-all font-mono">{d.integrity.sha256}</dd>
              <dt className="mt-1 text-muted">{t.record.basic}</dt>
              <dd>
                {d.integrity.indicators.filter((i) => i.severity === "potential").length
                  ? d.integrity.indicators
                      .filter((i) => i.severity === "potential")
                      .map((i) => (
                        <p key={i.code} className="text-conflict-fg">
                          {t.record.possible} <span lang="en">{i.message}</span>
                        </p>
                      ))
                  : t.record.basicClean}
              </dd>
              <dt className="mt-1 text-muted">{t.record.edits}</dt>
              <dd>
                {!d.forensics ? (
                  t.record.notRun
                ) : (
                  <>
                    <span className="text-muted">{format(t.record.lookedFor, { methods: d.forensics.methods.length ? d.forensics.methods.map((x) => t.methods[x]).join(", ") : t.record.nothingApplies })}</span>
                    {d.forensics.indicators
                      .filter((i) => i.severity === "potential")
                      .map((i, k) => (
                        <p key={k} className="text-conflict-fg">
                          {t.record.possible} <span lang="en">{i.message}</span>
                        </p>
                      ))}
                    {!d.forensics.indicators.some((i) => i.severity === "potential") && <p>{t.record.editsClean}</p>}
                  </>
                )}
              </dd>
              <dt className="mt-1 text-muted">{t.record.signature}</dt>
              <dd>
                {d.forensics?.signatures.length
                  ? d.forensics.signatures.map((x, k) => (
                      <p key={k} className={x.integrity === "invalid" ? "text-conflict-fg" : x.trustedAs && x.coversWholeFile ? "text-verified-fg" : ""}>
                        {x.signer ?? t.record.unknownSigner}: <span lang="en">{x.detail}</span>
                      </p>
                    ))
                  : t.record.noSignature}
              </dd>
              <dt className="mt-1 text-muted">{t.record.confirmed}</dt>
              <dd>
                {d.verifications?.length
                  ? [...d.verifications].reverse().map((v) => (
                      <p key={v.id} className={v.outcome === "denied" ? "text-conflict-fg" : v.outcome === "confirmed" ? "text-verified-fg" : ""}>
                        {rich(
                          format(t.record.verification, {
                            outcome: m.labels.verificationOutcome[v.outcome],
                            contact: v.contact,
                            reference: v.reference ? format(t.record.reference, { reference: v.reference }) : "",
                            method: m.labels.verificationMethod[v.method],
                            who: v.by,
                            note: v.note ? format(t.record.note, { note: v.note }) : "",
                          }),
                          { date: <DateTime iso={v.at} /> },
                        )}
                      </p>
                    ))
                  : t.record.notYet}
              </dd>
              {d.extractionHistory.length > 0 && (
                <>
                  <dt className="tech-detail mt-1 text-muted">{t.record.earlier}</dt>
                  <dd className="tech-detail">
                    {d.extractionHistory.map((h, i) => (
                      <span key={i}>
                        {i ? "; " : ""}
                        {h.mode === "demo-fixture" ? t.record.demoFixture : h.model} (<DateTime iso={h.extractedAt} />)
                      </span>
                    ))}
                  </dd>
                </>
              )}
            </dl>
          </section>
          <section className="card p-4">
            <div className="label mb-1">{t.verify.title}</div>
            <p className="mb-3 text-xs text-muted">{t.verify.body}</p>
            <VerificationForm caseId={c.id} docId={d.id} copy={{ ...t.verify, methods: m.labels.verificationMethod, saving: m.common.saving, requestFailed: m.errors.requestFailed }} />
          </section>
        </aside>
      </div>
    </>
  );
}
