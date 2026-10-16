import Link from "next/link";
import { CopyButton, RunAgentButton } from "@/components/client";
import { DateTime } from "@/components/ui";
import { currentFindings } from "@/lib/derive";
import type { Case, CitedText } from "@/lib/types";

/** The findings a draft is based on, by their titles (ids are internal), each linking to its evidence. */
function Cites({ c, ids }: { c: Case; ids: string[] }) {
  const titles = new Map(currentFindings(c).map((f) => [f.id, f.title]));
  const unique = Array.from(new Set(ids));
  if (!unique.length) return null;
  return (
    <span className="ml-1 text-xs text-muted">
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

/** The evidence agent (an ADK workflow on Gemini): a reviewer runs it, it investigates and drafts; a person decides and sends. */
export function AgentCard({ c, configured }: { c: Case; configured: boolean }) {
  const run = c.agentRuns?.at(-1);
  const edits = run?.forensicReport?.length ?? 0;
  return (
    <section aria-labelledby="agent-title" className="card overflow-hidden">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="max-w-xl">
          <h2 id="agent-title" className="font-semibold">
            Evidence agent <span className="font-normal text-muted">(optional)</span>
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            An AI assistant that looks the vehicle up in public registers, re-reads documents that did not finish, and drafts questions for the seller and emails to the companies that issued the documents. It cannot
            change a status or send anything: you decide what to send.
          </p>
        </div>
        <RunAgentButton caseId={c.id} disabled={!configured} />
      </header>
      {!configured && (
        <p className="px-5 py-3 text-sm text-muted">
          The evidence agent is not available on this server.<span className="tech-detail"> Set AGENT_SERVICE_URL to connect it.</span>
        </p>
      )}
      {run ? (
        <div className="grid gap-4 px-5 py-4">
          <p className="text-xs text-muted">
            Last run <DateTime iso={run.finishedAt} />
            <span className="tech-detail">
              {" "}
              · {run.model}
              {run.model === "offline-demo-planner" ? " (offline stand-in, not Gemini)" : ""} · agent {run.agentVersion} · {run.steps.length} steps
              {run.dropped.length ? ` · ${run.dropped.length} draft(s) removed by validation` : ""}
            </span>
          </p>
          {run.reviewerSummary.length > 0 && (
            <div>
              <h3 className="label mb-1">Summary for you</h3>
              <CitedList c={c} items={run.reviewerSummary} />
            </div>
          )}
          {run.sellerQuestions.length > 0 && (
            <div>
              <h3 className="label mb-1">Questions to ask the seller</h3>
              <CitedList c={c} items={run.sellerQuestions} />
            </div>
          )}
          {run.issuerRequests.length > 0 && (
            <div>
              <h3 className="label mb-1">Draft emails to document issuers (not sent)</h3>
              <p className="mb-2 text-xs text-muted">The issuer is the company that produced a document, such as the workshop that wrote an invoice. Find its contact details yourself, not from the document.</p>
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
          <Link href={`/cases/${c.id}/agent`} className="btn btn-secondary justify-self-start">
            See every step the agent took{edits ? ` and its analysis of ${edits} possibly edited document${edits === 1 ? "" : "s"}` : ""} →
          </Link>
        </div>
      ) : (
        configured && <p className="px-5 py-4 text-sm text-muted">Not run on this case yet. It usually takes under a minute.</p>
      )}
    </section>
  );
}
