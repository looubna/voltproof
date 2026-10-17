import Link from "next/link";
import { ReprocessButton } from "@/components/client";
import { CaseHeader, loadCase } from "@/components/case-header";
import { DateTime, FindingCard, StatusBadge, StatusLegend, docHref } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import type { Messages } from "@/i18n/messages/en";
import { rich } from "@/i18n/rich";
import { RULE_TEXT } from "@/i18n/rules";
import { getI18n } from "@/i18n/server";
import { requireUser } from "@/lib/auth";
import { actorName } from "@/lib/history";
import { getConfig } from "@/lib/config";
import { currentFindings, latestRun, reviewState } from "@/lib/derive";
import { findingView } from "@/lib/localize";
import type { CaseDocument, ExtractedField, FieldName, GroundingResult, Odometer } from "@/lib/types";

export const dynamic = "force-dynamic";

/** A read value for display: numbers in the reader's conventions, everything else as read. */
function shownValue(name: FieldName, f: ExtractedField<unknown>, locale: Locale, m: Messages) {
  if (f.value === null) return null;
  if (name === "odometer") return RULE_TEXT[locale].odo(f.value as Odometer);
  if (name === "documentType") return m.labels.docType[f.value as keyof Messages["labels"]["docType"]] ?? String(f.value);
  if (name === "batterySohPercent") return `${f.value}%`;
  return String(f.value);
}

const GROUNDING_CLASS: Record<GroundingResult, string> = {
  exact: "bg-verified-bg text-verified-fg",
  fuzzy: "bg-verified-bg text-verified-fg",
  other_page: "bg-consistent-bg text-consistent-fg",
  not_found: "bg-conflict-bg text-conflict-fg",
  not_checked: "bg-unknown-bg text-unknown-fg",
};

function GroundingTag({ g, copy }: { g: GroundingResult; copy: Messages["evidence"]["grounding"] }) {
  return (
    <span title={copy[g].title} className={`ml-1.5 inline-block whitespace-nowrap rounded-full px-1.5 py-px text-xs font-semibold not-italic ${GROUNDING_CLASS[g]}`}>
      {copy[g].text}
    </span>
  );
}

async function ExtractedFields({ caseId, doc, canReread }: { caseId: string; doc: CaseDocument; canReread: boolean }) {
  const { locale, m } = await getI18n();
  const t = m.evidence.extracted;
  const ex = doc.extraction;
  const names = ex ? (Object.keys(ex.fields) as FieldName[]) : [];
  const found = names.filter((n) => ex!.fields[n].value !== null);
  const missing = names.filter((n) => ex!.fields[n].value === null);
  return (
    <article className="card min-w-0 overflow-hidden">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-3">
        <div>
          <Link href={`/cases/${caseId}/documents/${doc.id}`} className="link break-all font-semibold">
            {doc.filename}
          </Link>
          <div className="mt-0.5 text-xs text-muted">{format(t.uploadedBy, { source: m.labels.provenance[doc.provenance], who: actorName(doc.uploadedBy, locale) })}</div>
        </div>
        <div className="flex flex-col items-end gap-1 text-xs">
          {ex ? (
            ex.mode === "demo-fixture" ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800">{t.sample}</span>
            ) : (
              <span className="rounded-full bg-brand-100 px-2 py-0.5 font-medium text-brand-700">
                {t.readByAi}
                <span className="tech-detail"> · {ex.model}</span>
              </span>
            )
          ) : (
            <span className="font-medium text-conflict-fg">{m.labels.extraction[doc.extractionStatus]}</span>
          )}
          {canReread && (
            <ReprocessButton
              caseId={caseId}
              docId={doc.id}
              label={ex?.mode === "vertex-gemini" ? t.readAgain : t.readWithAi}
              copy={{ reading: m.common.reading, updating: m.common.updating, requestFailed: m.errors.requestFailed }}
            />
          )}
        </div>
      </header>
      {doc.extractionError &&
        (doc.extractionStatus === "not_configured" ? (
          <p className="border-b border-line bg-conflict-bg/40 px-5 py-2 text-xs text-conflict-fg">{m.upload.notConfigured}</p>
        ) : (
          // The extraction error as it came back (from the AI service, for example), in English.
          <p lang="en" className="border-b border-line bg-conflict-bg/40 px-5 py-2 text-xs text-conflict-fg">
            {doc.extractionError}
          </p>
        ))}
      {ex && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-canvas text-xs text-muted">
              <tr>
                <th className="px-5 py-2 font-medium">{t.what}</th>
                <th className="px-3 py-2 font-medium">{t.value}</th>
                <th className="px-3 py-2 font-medium">{t.where}</th>
                <th className="tech-detail px-3 py-2 font-medium">
                  {t.confidence}
                  {ex.mode === "demo-fixture" ? t.illustrative : t.selfReported}
                </th>
                <th className="px-3 py-2 font-medium">{t.used}</th>
              </tr>
            </thead>
            <tbody>
              {found.map((n) => {
                const f = ex.fields[n];
                const href = docHref(caseId, { documentId: doc.id, page: f.page, quote: f.quote });
                return (
                  <tr key={n} className="border-t border-line align-top">
                    <td className="px-5 py-2 text-muted">{m.labels.field[n]}</td>
                    <td className="px-3 py-2 font-mono text-[13px]">{shownValue(n, f, locale, m)}</td>
                    <td className="px-3 py-2 text-xs">
                      <Link href={href!} className="link mr-1 font-medium">
                        {format(t.page, { page: f.page ?? "?" })}
                      </Link>
                      {f.quote ? <q className="italic text-muted">{f.quote}</q> : <span className="text-conflict-fg">{t.noQuote}</span>}
                      {f.grounded ? <GroundingTag g={f.grounded} copy={m.evidence.grounding} /> : null}
                      {f.secondRead ? (
                        <span
                          title={t.secondRead}
                          className={`ml-1.5 inline-block whitespace-nowrap rounded-full px-1.5 py-px text-xs font-semibold not-italic ${f.secondRead.result === "agree" ? "bg-verified-bg text-verified-fg" : f.secondRead.result === "disagree" ? "bg-conflict-bg text-conflict-fg" : "bg-unknown-bg text-unknown-fg"}`}
                        >
                          {f.secondRead.result === "agree" ? t.agree : f.secondRead.result === "disagree" ? format(t.disagree, { text: f.secondRead.text ?? "" }) : t.notFound}
                        </span>
                      ) : null}
                      {f.tamperIndicator ? (
                        <div className="mt-1 rounded bg-conflict-bg px-2 py-1 not-italic text-conflict-fg">
                          {t.possibleEdit} <span lang="en">{f.tamperIndicator}</span>
                        </div>
                      ) : null}
                    </td>
                    <td className="tech-detail px-3 py-2 tabular-nums">{f.confidence !== null ? `${Math.round(f.confidence * 100)}%` : "—"}</td>
                    <td className="px-3 py-2 text-xs">
                      {f.supported ? <span className="text-verified-fg">{t.yes}</span> : <span className="text-conflict-fg">{format(t.no, { reason: RULE_TEXT[locale].reason(f.unsupportedReason ?? "") })}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {missing.length > 0 && <p className="border-t border-line px-5 py-2 text-xs text-muted">{format(t.missing, { fields: missing.map((n) => m.labels.field[n]).join(", ") })}</p>}
          {/* The AI's own reading notes, as it wrote them. */}
          {ex.warnings.length > 0 && (
            <p className="border-t border-line px-5 py-2 text-xs text-conflict-fg">
              {t.warnings} <span lang="en">{ex.warnings.join("; ")}</span>
            </p>
          )}
        </div>
      )}
    </article>
  );
}

export default async function EvidencePage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const { locale, m } = await getI18n();
  const t = m.evidence;
  const c = await loadCase(id);
  const cfg = getConfig();
  const run = latestRun(c);
  const findings = currentFindings(c);
  const view = findingView(c, locale);
  const rules = findings.filter((f) => ["vehicle_identity", "odometer", "dates", "battery"].includes(f.category));
  const extraction = findings.filter((f) => f.category === "extraction");
  const integrity = findings.filter((f) => f.category === "integrity" || f.ruleId === "pdf_signature");
  const stored = findings.find((f) => f.id === "authenticity");
  const authenticity = stored ? view(stored) : null;
  const claims = findings.filter((f) => f.claim);

  return (
    <>
      <CaseHeader c={c} active="evidence" />

      {claims.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-1 text-lg font-semibold">{t.claims.title}</h2>
          <p className="mb-4 text-sm text-muted">
            {t.claims.body}
            <span className="tech-detail">{format(t.claims.assessor, { version: run?.assessorVersion ?? "—" })}</span>
          </p>
          <div className="grid gap-4">
            {claims.map((f) => (
              <FindingCard key={f.id} caseId={c.id} finding={view(f)} review={reviewState(c, f)} />
            ))}
          </div>
        </section>
      )}

      <section className="mb-10">
        <h2 className="mb-1 text-lg font-semibold">{t.read.title}</h2>
        <p className="mb-4 text-sm text-muted">
          {t.read.body}
          <span className="tech-detail">{format(t.read.threshold, { value: cfg.minConfidence })}</span>
        </p>
        <div className="grid gap-4">
          {c.documents.length === 0 ? <p className="text-sm text-muted">{t.read.none}</p> : null}
          {c.documents.map((d) => (
            <ExtractedFields key={d.id} caseId={c.id} doc={d} canReread={cfg.aiMode === "vertex"} />
          ))}
        </div>
      </section>

      <section className="mb-10">
        <h2 className="mb-1 text-lg font-semibold">{t.checks.title}</h2>
        <p className="mb-4 text-sm text-muted">
          {t.checks.body}
          <span className="tech-detail">{rich(format(t.checks.version, { version: run?.rulesVersion ?? "—" }), { date: run ? <DateTime iso={run.at} /> : "—" })}</span>
        </p>
        <div className="mb-4">
          <StatusLegend />
        </div>
        <div className="grid gap-4">
          {rules.map((f) => (
            <FindingCard key={f.id} caseId={c.id} finding={view(f)} review={reviewState(c, f)} />
          ))}
          {extraction.map((f) => (
            <FindingCard key={f.id} caseId={c.id} finding={view(f)} review={reviewState(c, f)} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-lg font-semibold">{t.genuine.title}</h2>
        <p className="mb-4 text-sm text-muted">{t.genuine.body}</p>
        <div className="grid gap-4">
          <div className="card p-5">
            <div className="label">{t.genuine.a.label}</div>
            <p className="mt-1 text-sm">{t.genuine.a.body}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {rules.map(view).map((f) => (
                <a key={f.id} href={`#${f.id}`} className="inline-flex items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-xs hover:bg-brand-50">
                  <span lang={f.lang !== locale ? f.lang : undefined}>{f.title}</span> <StatusBadge status={f.status} size="sm" />
                </a>
              ))}
            </div>
          </div>

          <div className="card min-w-0 p-5">
            <div className="label">{t.genuine.b.label}</div>
            <p className="mt-1 text-sm">{rich(t.genuine.b.body, { strong: <strong>{t.genuine.b.strong}</strong> })}</p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-muted">
                  <tr className="border-b border-line">
                    <th className="py-1.5 pr-3 font-medium">{t.genuine.b.document}</th>
                    <th className="tech-detail py-1.5 pr-3 font-medium">{t.genuine.b.sha}</th>
                    <th className="py-1.5 pr-3 font-medium">{t.genuine.b.result}</th>
                  </tr>
                </thead>
                <tbody>
                  {c.documents.map((d) => {
                    const pot = d.integrity.indicators.filter((i) => i.severity === "potential");
                    const info = d.integrity.indicators.filter((i) => i.severity === "info");
                    return (
                      <tr key={d.id} className="border-b border-line/70 align-top last:border-0">
                        <td className="py-2 pr-3 break-all">{d.filename}</td>
                        <td className="tech-detail py-2 pr-3 font-mono text-xs text-muted" title={d.integrity.sha256}>
                          {d.integrity.sha256.slice(0, 16)}…
                        </td>
                        {/* The file checks' own messages describe and quote the file, so they are kept as written. */}
                        <td className="py-2 pr-3 text-xs">
                          {pot.length ? (
                            <ul className="grid gap-1 text-conflict-fg">
                              {pot.map((i) => (
                                <li key={i.code}>
                                  {t.genuine.b.potential} <span lang="en">{i.message}</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <span className="text-muted">{t.genuine.b.clean}</span>
                          )}
                          {info.map((i) => (
                            <div key={i.code} className="mt-1 text-muted">
                              {t.genuine.b.note} <span lang="en">{i.message}</span>
                            </div>
                          ))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {integrity.length > 0 && (
              <div className="mt-4 grid gap-4">
                {integrity.map((f) => (
                  <FindingCard key={f.id} caseId={c.id} finding={view(f)} review={reviewState(c, f)} />
                ))}
              </div>
            )}
          </div>

          <div className="card border-conflict-dot/30 p-5" id="authenticity">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="label">{t.genuine.c.label}</div>
              {authenticity ? <StatusBadge status={authenticity.status} /> : null}
            </div>
            <p lang={authenticity && authenticity.lang !== locale ? authenticity.lang : undefined} className="mt-2 text-base font-semibold">
              {authenticity?.title ?? RULE_TEXT[locale].authenticity.title}
            </p>
            <p lang={authenticity && authenticity.lang !== locale ? authenticity.lang : undefined} className="mt-1 text-sm">
              {authenticity?.result}
            </p>
            <ul className="mt-3 grid gap-1 text-sm">
              {c.documents.map((d) => (
                <li key={d.id} className="flex flex-wrap justify-between gap-2 border-b border-line/70 py-1.5 last:border-0">
                  <span className="break-all">{d.filename}</span>
                  <span className="text-muted">
                    <Link className="link" href={`/cases/${c.id}/documents/${d.id}`}>
                      {authenticity?.evidence.find((e) => e.documentId === d.id)?.value ?? t.genuine.c.notPerformed}
                    </Link>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">
              {m.report.authenticity.title} {m.report.authenticity.body}
            </p>
            <p className="mt-1 text-xs text-muted">{format(t.genuine.c.howTo, { section: m.document.verify.title })}</p>
          </div>
        </div>
      </section>
    </>
  );
}
