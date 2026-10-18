import { PrintButton } from "@/components/client";
import { CaseHeader, loadCase } from "@/components/case-header";
import { LogoMark } from "@/components/logo";
import { EvidenceTable, StatusBadge, DateTime } from "@/components/ui";
import { format } from "@/i18n/format";
import { rich } from "@/i18n/rich";
import { getI18n } from "@/i18n/server";
import { requireUser } from "@/lib/auth";
import { actorName } from "@/lib/history";
import { findingView } from "@/lib/localize";
import { buildReport } from "@/lib/report";
import type { Status } from "@/lib/types";

export const dynamic = "force-dynamic";

function H({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <h2 className="mb-3 mt-8 flex items-baseline gap-2 border-b border-line pb-1 text-base font-semibold">
      <span className="text-muted">{n}.</span> {children}
    </h2>
  );
}

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { locale, m } = await getI18n();
  const t = m.report;
  const c = await loadCase(id);
  const r = buildReport(c, user, { locale, view: findingView(c, locale) });
  /** lang for text kept in the English of the record (findings the current rules no longer word the same). */
  const en = (lang?: string) => (lang && lang !== locale ? lang : undefined);
  const modes = r.extractionModes.map((x) => t.vehicle.modes[x as keyof typeof t.vehicle.modes] ?? x);
  const modeText = modes.length === 0 ? t.vehicle.noDocuments : new Intl.ListFormat(locale, { type: "conjunction" }).format(modes);

  return (
    <>
      <CaseHeader c={c} active="report" />
      <div className="no-print mb-6 flex flex-wrap gap-2">
        <PrintButton label={t.print} />
        <a className="btn btn-secondary" href={`/api/cases/${c.id}/report`}>
          {t.json}
        </a>
      </div>

      <article className="card mx-auto max-w-4xl p-6 sm:p-10 print:max-w-none print:border-0 print:p-0">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-navy-900 pb-4">
          <div>
            <div className="label flex items-center gap-2">
              {/* Loaded eagerly so it is in place when the report is printed or saved as PDF. */}
              <LogoMark size={20} priority />
              {t.eyebrow}
            </div>
            <h1 className="mt-1 text-2xl font-semibold">
              {r.vehicle.year} {r.vehicle.make} {r.vehicle.model}
            </h1>
            <p className="text-sm text-muted">{rich(format(t.meta, { case: r.case.caseNumber, who: r.generatedBy }), { date: <DateTime iso={r.generatedAt} /> })}</p>
          </div>
          {r.synthetic && <span className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900">{t.synthetic}</span>}
        </header>

        <p className="mt-4 rounded-lg bg-canvas px-4 py-3 text-sm">{rich(t.scope, { strong: <strong>{t.scopeStrong}</strong> })}</p>

        {r.claims.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-2 text-base font-semibold">{t.claims}</h2>
            <ul className="divide-y divide-line rounded-lg border border-line">
              {r.claims.map((cl) => (
                <li key={cl.claimId} className="px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span lang={en(cl.lang)} className="font-semibold">
                      {cl.label}
                    </span>
                    <StatusBadge status={cl.status} size="sm" detail={cl.humanReview ? format(t.reviewDetail, { resolution: cl.humanReview.resolution.toLowerCase() }) : undefined} />
                  </div>
                  <p lang={en(cl.lang)} className="mt-0.5">
                    {cl.result}
                  </p>
                  {cl.sources.length > 0 ? (
                    <div className="mt-2">
                      <EvidenceTable caseId={c.id} evidence={cl.sources} />
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-muted">
                      {t.noSource}
                      {cl.missing ? format(t.missing, { what: cl.missing }) : ""}
                    </p>
                  )}
                </li>
              ))}
            </ul>
            {r.claimSummary && <p className="mt-3 rounded-lg bg-canvas px-4 py-3 text-sm font-medium">{r.claimSummary}</p>}
            {r.questions.length > 0 && (
              <>
                <h3 className="mb-1 mt-4 text-sm font-semibold">{t.questions}</h3>
                <ol className="list-decimal pl-5 text-sm">
                  {r.questions.map((q) => (
                    <li key={q.claimId} className="mb-1">
                      {q.question} <span className="text-xs text-muted">({q.claim})</span>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </section>
        )}

        <H n={1}>{t.sections.vehicle}</H>
        <dl className="grid grid-cols-[140px_minmax(0,1fr)] gap-y-1 text-sm">
          <dt className="text-muted">{t.vehicle.makeModelYear}</dt>
          <dd>
            {r.vehicle.make} {r.vehicle.model} {r.vehicle.year ?? ""}
          </dd>
          <dt className="text-muted">{t.vehicle.vin}</dt>
          <dd className="font-mono">{r.vehicle.vin || "—"}</dd>
          <dt className="text-muted">{t.vehicle.opened}</dt>
          <dd>{rich(format(t.vehicle.openedBy, { who: actorName(r.case.createdBy, locale) }), { date: <DateTime iso={r.case.createdAt} /> })}</dd>
          <dt className="text-muted">{t.vehicle.extraction}</dt>
          <dd>{modeText}</dd>
          <dt className="text-muted">{t.vehicle.rules}</dt>
          <dd>{r.rules ? rich(format(t.vehicle.rulesLine, { version: r.rules.version, assessor: r.rules.assessorVersion }), { date: <DateTime iso={r.rules.ranAt} /> }) : "—"}</dd>
        </dl>

        <H n={2}>{t.sections.statuses}</H>
        <div className="grid gap-2 sm:grid-cols-4">
          {(["verified", "consistent", "conflict", "unknown"] as Status[]).map((s) => (
            <div key={s} className="rounded-lg border border-line p-3">
              <div className="flex items-center justify-between">
                <StatusBadge status={s} size="sm" />
                <span className="text-xl font-semibold tabular-nums">{r.statusCounts[s]}</span>
              </div>
              <p className="mt-1 text-xs leading-snug text-muted">{m.statusDetail[s]}</p>
            </div>
          ))}
        </div>

        <H n={3}>{t.sections.unresolved}</H>
        {r.unresolved.length === 0 ? (
          <p className="text-sm">{t.noUnresolved}</p>
        ) : (
          <>
            <ol className="grid grid-cols-1 gap-3 text-sm">
              {r.unresolved.map((u) => (
                <li key={u.id} className="rounded-lg border border-line p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong lang={en(u.lang)}>{u.title}</strong>
                    <StatusBadge status={u.status} size="sm" detail={u.status === "conflict" ? t.awaiting : undefined} />
                  </div>
                  <p lang={en(u.lang)} className="mt-1">
                    {u.result}
                  </p>
                  {u.nextAction && (
                    <p className="mt-1">
                      <span className="text-muted">{t.nextAction}</span> <span lang={en(u.lang)}>{u.nextAction}</span>
                    </p>
                  )}
                </li>
              ))}
            </ol>
            <div className="mt-3 text-sm">
              <div className="font-medium">{t.nextSteps}</div>
              <ul className="mt-1 list-disc pl-5">
                {r.nextSteps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          </>
        )}

        <H n={4}>{t.sections.checks}</H>
        {/* minmax(0,1fr) columns let each evidence table scroll inside its box on a phone. */}
        <div className="grid grid-cols-1 gap-4">
          {r.checks.map((ch) => (
            <section key={ch.id} className="break-inside-avoid rounded-lg border border-line p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong lang={en(ch.lang)}>{ch.title}</strong>
                <StatusBadge status={ch.status} size="sm" />
              </div>
              <p className="mt-1 text-xs text-muted">{rich(t.checked, { checked: <span lang={en(ch.lang)}>{ch.checked}</span> })}</p>
              <p lang={en(ch.lang)} className="mt-1">
                {ch.result}
              </p>
              <div className="mt-2">
                <EvidenceTable caseId={c.id} evidence={ch.evidence} />
              </div>
              {ch.humanReview && (
                <p className="mt-2 rounded bg-canvas px-2 py-1 text-xs">
                  <strong>{t.humanReview}</strong>{" "}
                  {rich(format(t.reviewLine, { resolution: ch.humanReview.resolution, reviewer: ch.humanReview.reviewer, note: ch.humanReview.note }), { date: <DateTime iso={ch.humanReview.at} /> })}
                  {ch.humanReview.stale ? t.stale : ""}
                </p>
              )}
            </section>
          ))}
        </div>

        <H n={5}>{t.sections.documents}</H>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-muted">
              <tr className="border-b border-line">
                <th className="py-1 pr-2 font-medium">{t.documents.file}</th>
                <th className="py-1 pr-2 font-medium">{t.documents.type}</th>
                <th className="py-1 pr-2 font-medium">{t.documents.source}</th>
                <th className="py-1 pr-2 font-medium">{t.documents.uploaded}</th>
                <th className="py-1 pr-2 font-medium">{t.documents.readBy}</th>
                <th className="py-1 pr-2 font-medium">{t.documents.sha}</th>
              </tr>
            </thead>
            <tbody>
              {r.documents.map((d) => (
                <tr key={d.id} className="border-b border-line/70 align-top">
                  <td className="py-1.5 pr-2 break-all">{d.filename}</td>
                  <td className="py-1.5 pr-2">{d.type}</td>
                  <td className="py-1.5 pr-2">{d.provenance}</td>
                  <td className="py-1.5 pr-2">
                    {actorName(d.uploadedBy, locale)}, <DateTime iso={d.uploadedAt} />
                  </td>
                  <td className="py-1.5 pr-2">{d.extractionMode === "demo-fixture" ? t.documents.demoFixture : (d.extractionModel ?? m.labels.extraction[d.extractionStatus])}</td>
                  <td className="py-1.5 pr-2 font-mono">{d.sha256.slice(0, 12)}…</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <H n={6}>{t.sections.facts}</H>
        <EvidenceTable caseId={c.id} evidence={r.keyFacts} />

        <H n={7}>{t.sections.notes}</H>
        {r.reviewerNotes.length === 0 ? (
          <p className="text-sm text-muted">{t.notes.none}</p>
        ) : (
          <ol className="grid gap-2 text-sm">
            {r.reviewerNotes.map((n, i) => (
              <li key={i} className="rounded-lg border border-line p-3">
                <div className="text-xs text-muted">
                  {rich(format(t.notes.line, { reviewer: n.reviewer, finding: n.finding, status: m.status[n.machineStatus] }), { date: <DateTime iso={n.at} /> })}
                </div>
                <div className="mt-0.5">
                  <strong>{n.resolution}.</strong> {n.note}
                </div>
              </li>
            ))}
          </ol>
        )}

        <H n={8}>{t.sections.authenticity}</H>
        <p className="rounded-lg border-2 border-conflict-dot/40 bg-conflict-bg/30 p-4 text-sm">
          <strong>{t.authenticity.title}</strong> {t.authenticity.body}
        </p>
        <ul className="mt-3 list-disc pl-5 text-xs text-muted">
          <li>{t.limits.battery}</li>
          <li>{t.limits.conflict}</li>
          <li>{t.limits.reading}</li>
          {r.synthetic && <li>{t.limits.synthetic}</li>}
        </ul>
      </article>
    </>
  );
}
