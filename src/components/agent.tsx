import Link from "next/link";
import { CopyButton, RunAgentButton } from "@/components/client";
import { DateTime } from "@/components/ui";
import { currentFindings } from "@/lib/derive";
import type { Case, CitedText } from "@/lib/types";

const KIND_DOT: Record<string, string> = { check: "bg-consistent-dot", tool_call: "bg-brand-600", decision: "bg-conflict-dot", draft: "bg-verified-dot" };

/** The findings a draft is based on, by their titles (ids are internal), each linking to its evidence. */
function Cites({ c, ids }: { c: Case; ids: string[] }) {
  const titles = new Map(currentFindings(c).map((f) => [f.id, f.title]));
  const unique = Array.from(new Set(ids));
  if (!unique.length) return null;
  return (
    <span className="ml-1 text-[11px] text-muted">
      (see{" "}
      {unique.map((id, i) => (
        <span key={id}>
          {i ? ", " : ""}
          <Link href={`/cases/${c.id}/evidence#${id}`} className="link">
            {titles.get(id) ?? "an earlier finding"}
          </Link>
        </span>
      ))}
      )
    </span>
  );
}

function CitedList({ c, items }: { c: Case; items: CitedText[] }) {
  return (
    <ul className="grid gap-1.5">
      {items.map((q, i) => (
        <li key={i} className="flex items-start justify-between gap-2 text-sm">
          <span>
            {q.text}
            <Cites c={c} ids={q.findingIds} />
          </span>
          <CopyButton text={q.text} />
        </li>
      ))}
    </ul>
  );
}

/** The ADK evidence agent: a reviewer runs it, it investigates and drafts; a person decides and sends. */
export function AgentCard({ c, configured }: { c: Case; configured: boolean }) {
  const run = c.agentRuns?.at(-1);
  return (
    <section className="card overflow-hidden">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h2 className="font-semibold">Evidence agent</h2>
          <p className="mt-0.5 max-w-xl text-xs text-muted">
            An ADK workflow on Gemini: runs the registry checks, re-checks documents whose checks did not complete, and drafts questions and issuer requests. It cannot set a status or send anything. You review and send.
          </p>
        </div>
        <RunAgentButton caseId={c.id} disabled={!configured} />
      </header>
      {!configured && <p className="px-5 py-3 text-xs text-muted">Not configured on this server (AGENT_SERVICE_URL).</p>}
      {run ? (
        <div className="grid gap-4 px-5 py-4">
          <Link href={`/cases/${c.id}/agent`} className="btn btn-secondary justify-self-start">
            See exactly what the agent did{run.forensicReport?.length ? ` and the falsification analysis (${run.forensicReport.length} document${run.forensicReport.length === 1 ? "" : "s"})` : ""} →
          </Link>
          <p className="text-xs text-muted">
            Last run <DateTime iso={run.finishedAt} /> · {run.model}
            {run.model === "offline-demo-planner" ? " (offline stand-in, not Gemini)" : ""} · agent {run.agentVersion} · {run.steps.length} steps
            {run.dropped.length ? ` · ${run.dropped.length} draft(s) removed by validation` : ""}
          </p>
          {run.reviewerSummary.length > 0 && (
            <div>
              <div className="label mb-1">Summary for you</div>
              <CitedList c={c} items={run.reviewerSummary} />
            </div>
          )}
          {run.sellerQuestions.length > 0 && (
            <div>
              <div className="label mb-1">Questions for the seller</div>
              <CitedList c={c} items={run.sellerQuestions} />
            </div>
          )}
          {run.issuerRequests.length > 0 && (
            <div>
              <div className="label mb-1">Issuer requests (drafts, not sent)</div>
              <ul className="grid gap-2">
                {run.issuerRequests.map((r, i) => (
                  <li key={i} className="rounded-lg border border-line bg-canvas p-3 text-sm">
                    <div className="flex justify-between gap-2 text-xs text-muted">
                      <span>To: {r.to}</span>
                      <CopyButton text={`Subject: ${r.subject}\n\n${r.text}`} />
                    </div>
                    <div className="mt-1 font-medium">{r.subject}</div>
                    <p className="mt-1">
                      {r.text}
                      <Cites c={c} ids={r.findingIds} />
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <details className="text-sm">
            <summary className="cursor-pointer text-muted">What the agent did ({run.steps.length} steps)</summary>
            <ol className="mt-2 grid gap-1.5 border-l-2 border-line pl-3">
              {run.steps.map((s, i) => (
                <li key={i} className="text-xs">
                  <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${KIND_DOT[s.kind] ?? "bg-unknown-dot"}`} />
                  <span className="font-mono text-muted">{s.node}</span> {s.summary}
                </li>
              ))}
            </ol>
            {run.dropped.length > 0 && (
              <div className="mt-2 text-xs text-muted">
                Removed by validation: {run.dropped.join(" · ")}
              </div>
            )}
          </details>
        </div>
      ) : (
        configured && <p className="px-5 py-4 text-sm text-muted">Not run yet on this case.</p>
      )}
    </section>
  );
}
