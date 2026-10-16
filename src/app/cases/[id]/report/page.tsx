import { PrintButton } from "@/components/client";
import { CaseHeader, loadCase } from "@/components/case-header";
import { EvidenceTable, StatusBadge, fmtDateTime } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { STATUS_LABEL, STATUS_MEANING } from "@/lib/labels";
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
  const c = await loadCase(id);
  const r = buildReport(c, user);
  const modeText = r.extractionModes.length === 0 ? "No documents read" : r.extractionModes.map((m) => (m === "demo-fixture" ? "demo fixtures (no live AI)" : "Gemini on Vertex AI (live)")).join(" and ");

  return (
    <>
      <CaseHeader c={c} active="report" />
      <div className="no-print mb-6 flex flex-wrap gap-2">
        <PrintButton />
        <a className="btn btn-secondary" href={`/api/cases/${c.id}/report`}>
          Download JSON (machine-readable)
        </a>
      </div>

      <article className="card mx-auto max-w-4xl p-6 sm:p-10 print:max-w-none print:border-0 print:p-0">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-navy-900 pb-4">
          <div>
            <div className="label">VoltProof · Evidence review report</div>
            <h1 className="mt-1 text-2xl font-semibold">
              {r.vehicle.year} {r.vehicle.make} {r.vehicle.model}
            </h1>
            <p className="text-sm text-muted">
              Case {r.case.caseNumber} · generated {fmtDateTime(r.generatedAt)} by {r.generatedBy}
            </p>
          </div>
          {r.synthetic && <span className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900">SYNTHETIC DATA — FICTIONAL DEMONSTRATION CASE</span>}
        </header>

        <p className="mt-4 rounded-lg bg-canvas px-4 py-3 text-sm">
          <strong>Scope.</strong> This report summarises what the submitted documents show, where they disagree and what is missing, to support a dealership purchase decision. It is not a
          vehicle valuation, a battery certification or a fraud determination.
        </p>

        {r.claims.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-2 text-base font-semibold">Seller claims at a glance</h2>
            <ul className="divide-y divide-line rounded-lg border border-line">
              {r.claims.map((cl) => (
                <li key={cl.claimId} className="px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">{cl.label}</span>
                    <StatusBadge status={cl.status} size="sm" detail={cl.humanReview ? `review: ${cl.humanReview.resolution.toLowerCase()}` : undefined} />
                  </div>
                  <p className="mt-0.5">{cl.result}</p>
                  {cl.sources.length > 0 ? (
                    <div className="mt-2">
                      <EvidenceTable caseId={c.id} evidence={cl.sources} />
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-muted">No source yet.{cl.missing ? ` Missing: ${cl.missing}` : ""}</p>
                  )}
                </li>
              ))}
            </ul>
            {r.claimSummary && <p className="mt-3 rounded-lg bg-canvas px-4 py-3 text-sm font-medium">{r.claimSummary}</p>}
            {r.questions.length > 0 && (
              <>
                <h3 className="mb-1 mt-4 text-sm font-semibold">Questions to ask before you pay</h3>
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

        <H n={1}>Vehicle and case</H>
        <dl className="grid grid-cols-[140px_1fr] gap-y-1 text-sm">
          <dt className="text-muted">Make / model / year</dt>
          <dd>
            {r.vehicle.make} {r.vehicle.model} {r.vehicle.year ?? ""}
          </dd>
          <dt className="text-muted">VIN (case record)</dt>
          <dd className="font-mono">{r.vehicle.vin || "—"}</dd>
          <dt className="text-muted">Case opened</dt>
          <dd>
            {fmtDateTime(r.case.createdAt)} by {r.case.createdBy}
          </dd>
          <dt className="text-muted">Extraction</dt>
          <dd>{modeText}</dd>
          <dt className="text-muted">Rules</dt>
          <dd>{r.rules ? `Rules ${r.rules.version}, claim assessor ${r.rules.assessorVersion}, run ${fmtDateTime(r.rules.ranAt)}` : "—"}</dd>
        </dl>

        <H n={2}>Summary of statuses</H>
        <div className="grid gap-2 sm:grid-cols-4">
          {(["verified", "consistent", "conflict", "unknown"] as Status[]).map((s) => (
            <div key={s} className="rounded-lg border border-line p-3">
              <div className="flex items-center justify-between">
                <StatusBadge status={s} size="sm" />
                <span className="text-xl font-semibold tabular-nums">{r.statusCounts[s]}</span>
              </div>
              <p className="mt-1 text-[11px] leading-snug text-muted">{STATUS_MEANING[s]}</p>
            </div>
          ))}
        </div>

        <H n={3}>Unresolved issues and recommended next steps</H>
        {r.unresolved.length === 0 ? (
          <p className="text-sm">No unresolved issues affect the decision. Authenticity remains not verified (see section 8).</p>
        ) : (
          <>
            <ol className="grid gap-3 text-sm">
              {r.unresolved.map((u) => (
                <li key={u.id} className="rounded-lg border border-line p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong>{u.title}</strong>
                    <StatusBadge status={u.status} size="sm" detail={u.status === "conflict" ? "awaiting human review" : undefined} />
                  </div>
                  <p className="mt-1">{u.result}</p>
                  {u.nextAction && <p className="mt-1"><span className="text-muted">Next action:</span> {u.nextAction}</p>}
                </li>
              ))}
            </ol>
            <div className="mt-3 text-sm">
              <div className="font-medium">Next steps</div>
              <ul className="mt-1 list-disc pl-5">
                {r.nextSteps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          </>
        )}

        <H n={4}>Check results with supporting evidence</H>
        <div className="grid gap-4">
          {r.checks.map((ch) => (
            <section key={ch.id} className="break-inside-avoid rounded-lg border border-line p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong>{ch.title}</strong>
                <StatusBadge status={ch.status} size="sm" />
              </div>
              <p className="mt-1 text-xs text-muted">Checked: {ch.checked}</p>
              <p className="mt-1">{ch.result}</p>
              <div className="mt-2">
                <EvidenceTable caseId={c.id} evidence={ch.evidence} />
              </div>
              {ch.humanReview && (
                <p className="mt-2 rounded bg-canvas px-2 py-1 text-xs">
                  <strong>Human review:</strong> {ch.humanReview.resolution} by {ch.humanReview.reviewer}, {fmtDateTime(ch.humanReview.at)} — “{ch.humanReview.note}”
                  {ch.humanReview.stale ? " (evidence changed after this review)" : ""}
                </p>
              )}
            </section>
          ))}
        </div>

        <H n={5}>Documents received</H>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-muted">
              <tr className="border-b border-line">
                <th className="py-1 pr-2 font-medium">File</th>
                <th className="py-1 pr-2 font-medium">Type</th>
                <th className="py-1 pr-2 font-medium">Source</th>
                <th className="py-1 pr-2 font-medium">Uploaded</th>
                <th className="py-1 pr-2 font-medium">Read by</th>
                <th className="py-1 pr-2 font-medium">SHA-256</th>
              </tr>
            </thead>
            <tbody>
              {r.documents.map((d) => (
                <tr key={d.id} className="border-b border-line/70 align-top">
                  <td className="py-1.5 pr-2 break-all">{d.filename}</td>
                  <td className="py-1.5 pr-2">{d.type}</td>
                  <td className="py-1.5 pr-2">{d.provenance}</td>
                  <td className="py-1.5 pr-2">
                    {d.uploadedBy}, {fmtDateTime(d.uploadedAt)}
                  </td>
                  <td className="py-1.5 pr-2">{d.extractionMode === "demo-fixture" ? "Demo fixture" : d.extractionModel ?? d.extractionStatus}</td>
                  <td className="py-1.5 pr-2 font-mono">{d.sha256.slice(0, 12)}…</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <H n={6}>Key extracted information</H>
        <EvidenceTable caseId={c.id} evidence={r.keyFacts} />

        <H n={7}>Reviewer notes</H>
        {r.reviewerNotes.length === 0 ? (
          <p className="text-sm text-muted">No reviewer notes recorded.</p>
        ) : (
          <ol className="grid gap-2 text-sm">
            {r.reviewerNotes.map((n, i) => (
              <li key={i} className="rounded-lg border border-line p-3">
                <div className="text-xs text-muted">
                  {fmtDateTime(n.at)} · {n.reviewer} · {n.finding} (machine status: {STATUS_LABEL[n.machineStatus]})
                </div>
                <div className="mt-0.5">
                  <strong>{n.resolution}.</strong> {n.note}
                </div>
              </li>
            ))}
          </ol>
        )}

        <H n={8}>Authenticity and limitations</H>
        <p className="rounded-lg border-2 border-conflict-dot/40 bg-conflict-bg/30 p-4 text-sm">
          <strong>Authenticity not verified.</strong> {r.authenticityStatement.replace(/^Authenticity not verified\.\s*/, "")}
        </p>
        <ul className="mt-3 list-disc pl-5 text-xs text-muted">
          <li>Battery figures are shown exactly as reported by the test provider. VoltProof does not test batteries.</li>
          <li>A Conflict means sources disagree or a check failed; it is not proof of fraud. Possible explanations should be investigated.</li>
          <li>Values were read by AI or from demo fixtures and may contain reading errors; each value links to its page and quote for checking.</li>
          {r.synthetic && <li>This case uses synthetic, fictional data for demonstration.</li>}
        </ul>
      </article>
    </>
  );
}
