import Link from "next/link";
import { CaseHeader, loadCase } from "@/components/case-header";
import { ForensicReportCard } from "@/components/forensic-report";
import { DateTime } from "@/components/ui";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const KIND: Record<string, { label: string; cls: string }> = {
  check: { label: "Check", cls: "bg-consistent-bg text-consistent-fg" },
  tool_call: { label: "Tool", cls: "bg-brand-50 text-brand-700" },
  model_call: { label: "Gemini", cls: "bg-verified-bg text-verified-fg" },
  analysis: { label: "Gemini Pro", cls: "bg-conflict-bg text-conflict-fg" },
  decision: { label: "Decision", cls: "bg-unknown-bg text-unknown-fg" },
  draft: { label: "Drafts", cls: "bg-verified-bg text-verified-fg" },
};

const NODE_LABEL: Record<string, string> = {
  load_case: "1 · Load case",
  reference_checks: "2 · Registry checks (parallel)",
  open_items: "3 · Open items",
  investigator: "4 · Investigator (Gemini + tools)",
  route_round: "4 · Investigator",
  forensic_analyst: "5 · Forensic analyst (Gemini Pro)",
  drafter: "6 · Drafter (Gemini)",
  validate_drafts: "7 · Validation",
};

export default async function AgentRunPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const c = await loadCase(id);
  const run = c.agentRuns?.at(-1);
  return (
    <>
      <CaseHeader c={c} active="overview" />
      <div className="mb-6">
        <Link href={`/cases/${c.id}`} className="link text-sm">
          ← Back to the case
        </Link>
        <h2 className="mt-2 text-xl font-semibold">What the evidence agent did</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Every step the agent took on this case: the vehicle registers it looked up, the documents it re-read, its explanation of any document that looks edited, and the drafts it wrote for you. It cannot set
          a status, record a review or send anything.
          <span className="tech-detail">
            {" "}
            An ADK 2 workflow on Gemini (Vertex AI): registry checks run in parallel, Gemini Pro explains each flagged document.
          </span>
        </p>
      </div>
      {!run ? (
        <p className="text-sm text-muted">The agent has not run on this case yet. Run it from the case overview.</p>
      ) : (
        <div className="grid gap-8">
          <section className="card overflow-hidden">
            <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-5 py-3">
              <h3 className="font-semibold">Step by step</h3>
              <span className="text-xs text-muted">
                <DateTime iso={run.startedAt} /> · {run.steps.length} steps · {Math.round((new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 1000)} s · agent {run.agentVersion}
              </span>
            </header>
            <ol className="divide-y divide-line">
              {run.steps.map((s, i) => (
                <li key={i} className="grid gap-1 px-5 py-2.5 text-sm sm:grid-cols-[34px_210px_1fr_auto]">
                  <span className="text-xs tabular-nums text-muted">{i + 1}</span>
                  <span className="text-xs">
                    <span className={`mr-1.5 inline-block rounded-full px-1.5 py-px text-xs font-semibold ${KIND[s.kind]?.cls ?? ""}`}>{KIND[s.kind]?.label ?? s.kind}</span>
                    <span className="text-muted">{NODE_LABEL[s.node] ?? s.node}</span>
                  </span>
                  <span>
                    {s.summary}
                    {s.detail && <div className="mt-0.5 text-xs text-muted">{s.detail}</div>}
                  </span>
                  <span className="whitespace-nowrap text-right text-xs text-muted">
                    {s.model ? <span className="mr-2 font-mono">{s.model}</span> : null}
                    {s.tool ? <span className="mr-2 font-mono">{s.tool}</span> : null}
                    {typeof s.ms === "number" ? `${(s.ms / 1000).toFixed(1)} s` : ""}
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <section className="grid gap-4">
            <h3 className="text-lg font-semibold">Documents that may have been edited</h3>
            {run.forensicReport?.length ? (
              run.forensicReport.map((r) => <ForensicReportCard key={r.documentId} c={c} report={r} />)
            ) : (
              <p className="text-sm text-muted">No document on this case showed signs of editing, so there was nothing to explain.</p>
            )}
          </section>

          <section className="card grid gap-4 p-5">
            <h3 className="font-semibold">Drafts for you (nothing was sent)</h3>
            {run.reviewerSummary.map((q, i) => (
              <p key={i} className="text-sm">{q.text}</p>
            ))}
            {run.sellerQuestions.length > 0 && (
              <div>
                <div className="label mb-1">Questions for the seller</div>
                <ol className="list-decimal pl-5 text-sm">
                  {run.sellerQuestions.map((q, i) => (
                    <li key={i}>{q.text}</li>
                  ))}
                </ol>
              </div>
            )}
            {run.issuerRequests.map((r, i) => (
              <div key={i} className="rounded-lg border border-line bg-canvas p-3 text-sm">
                <div className="text-xs text-muted">To: {r.to}</div>
                <div className="font-medium">{r.subject}</div>
                <p>{r.text}</p>
              </div>
            ))}
            {run.dropped.length > 0 && <p className="text-xs text-muted">Removed by validation: {run.dropped.join(" · ")}</p>}
          </section>
        </div>
      )}
    </>
  );
}
