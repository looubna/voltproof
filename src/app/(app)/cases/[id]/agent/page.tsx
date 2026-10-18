import Link from "next/link";
import { CaseHeader, loadCase } from "@/components/case-header";
import { ForensicReportCard } from "@/components/forensic-report";
import { DateTime } from "@/components/ui";
import { INTL_LOCALE } from "@/i18n/config";
import { format, formatPlural } from "@/i18n/format";
import { rich } from "@/i18n/rich";
import { getI18n } from "@/i18n/server";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const KIND_CLASS: Record<string, string> = {
  check: "bg-consistent-bg text-consistent-fg",
  tool_call: "bg-brand-50 text-brand-700",
  model_call: "bg-verified-bg text-verified-fg",
  analysis: "bg-conflict-bg text-conflict-fg",
  decision: "bg-unknown-bg text-unknown-fg",
  draft: "bg-verified-bg text-verified-fg",
};

// The agent's steps and drafts are its own words, in English, shown as written (lang="en");
// the labels around them are in the reader's language.

export default async function AgentRunPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const { locale, m } = await getI18n();
  const t = m.agentPage;
  const kinds = t.kind as Record<string, string>;
  const nodes = t.node as Record<string, string>;
  const seconds = (ms: number) => format(m.common.seconds, { count: (ms / 1000).toLocaleString(INTL_LOCALE[locale], { minimumFractionDigits: 1, maximumFractionDigits: 1 }) });
  const c = await loadCase(id);
  const run = c.agentRuns?.at(-1);
  return (
    <>
      <CaseHeader c={c} active="overview" />
      <div className="mb-6">
        <Link href={`/cases/${c.id}`} className="link text-sm">
          {t.back}
        </Link>
        <h2 className="mt-2 text-xl font-semibold">{t.title}</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          {t.body}
          <span className="tech-detail">{t.bodyTech}</span>
        </p>
        {run && locale !== "en" ? <p className="mt-1 max-w-3xl text-xs text-muted">{t.aiNote}</p> : null}
      </div>
      {!run ? (
        <p className="text-sm text-muted">{t.notRun}</p>
      ) : (
        <div className="grid gap-8">
          <section className="card overflow-hidden">
            <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-5 py-3">
              <h3 className="font-semibold">{t.steps}</h3>
              <span className="text-xs text-muted">
                {rich(
                  format(t.meta, {
                    steps: formatPlural(locale, m.agentCard.steps, run.steps.length),
                    seconds: format(m.common.seconds, { count: Math.round((new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 1000).toLocaleString(INTL_LOCALE[locale]) }),
                    version: run.agentVersion,
                  }),
                  { date: <DateTime iso={run.startedAt} /> },
                )}
              </span>
            </header>
            <ol className="divide-y divide-line">
              {run.steps.map((s, i) => (
                <li key={i} className="grid gap-1 px-5 py-2.5 text-sm sm:grid-cols-[34px_210px_1fr_auto]">
                  <span className="text-xs tabular-nums text-muted">{i + 1}</span>
                  <span className="text-xs">
                    <span className={`mr-1.5 inline-block rounded-full px-1.5 py-px text-xs font-semibold ${KIND_CLASS[s.kind] ?? ""}`}>{kinds[s.kind] ?? s.kind}</span>
                    <span className="text-muted">{nodes[s.node] ?? s.node}</span>
                  </span>
                  <span lang="en">
                    {s.summary}
                    {s.detail && <div className="mt-0.5 text-xs text-muted">{s.detail}</div>}
                  </span>
                  <span className="whitespace-nowrap text-right text-xs text-muted">
                    {s.model ? <span className="mr-2 font-mono">{s.model}</span> : null}
                    {s.tool ? <span className="mr-2 font-mono">{s.tool}</span> : null}
                    {typeof s.ms === "number" ? seconds(s.ms) : ""}
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <section className="grid gap-4">
            <h3 className="text-lg font-semibold">{t.edited}</h3>
            {run.forensicReport?.length ? run.forensicReport.map((r) => <ForensicReportCard key={r.documentId} c={c} report={r} />) : <p className="text-sm text-muted">{t.noEdits}</p>}
          </section>

          <section className="card grid gap-4 p-5">
            <h3 className="font-semibold">{t.drafts}</h3>
            {run.reviewerSummary.map((q, i) => (
              <p key={i} lang="en" className="text-sm">
                {q.text}
              </p>
            ))}
            {run.sellerQuestions.length > 0 && (
              <div>
                <div className="label mb-1">{t.questions}</div>
                <ol lang="en" className="list-decimal pl-5 text-sm">
                  {run.sellerQuestions.map((q, i) => (
                    <li key={i}>{q.text}</li>
                  ))}
                </ol>
              </div>
            )}
            {run.issuerRequests.map((r, i) => (
              <div key={i} className="rounded-lg border border-line bg-canvas p-3 text-sm">
                <div className="text-xs text-muted">{format(m.agentCard.to, { to: r.to })}</div>
                <div lang="en" className="font-medium">
                  {r.subject}
                </div>
                <p lang="en">{r.text}</p>
              </div>
            ))}
            {run.dropped.length > 0 && (
              <p className="text-xs text-muted">
                {t.dropped} <span lang="en">{run.dropped.join(" · ")}</span>
              </p>
            )}
          </section>
        </div>
      )}
    </>
  );
}
