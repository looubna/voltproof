import Link from "next/link";
import { CopyButton, RunAgentButton } from "@/components/client";
import { DateTime } from "@/components/ui";
import { format, formatPlural } from "@/i18n/format";
import { rich } from "@/i18n/rich";
import { getI18n } from "@/i18n/server";
import { currentFindings } from "@/lib/derive";
import type { FindingView } from "@/lib/localize";
import type { Case, CitedText } from "@/lib/types";

// The agent writes in English (its prompts and the findings it reads are English), and its
// drafts are shown as written: they are marked lang="en" and never translated.

/** The findings a draft is based on, by their titles (ids are internal), each linking to its evidence. */
function Cites({ c, ids, view, copy }: { c: Case; ids: string[]; view: FindingView; copy: { cites: string; earlier: string } }) {
  const titles = new Map(currentFindings(c).map((f) => [f.id, view(f).title]));
  const unique = Array.from(new Set(ids));
  if (!unique.length) return null;
  const list = unique.map((id, i) => (
    <span key={id}>
      {i ? ", " : ""}
      <Link href={`/cases/${c.id}/evidence#${id}`} className="link">
        {titles.get(id) ?? copy.earlier}
      </Link>
    </span>
  ));
  return <span className="ml-1 text-xs text-muted">{rich(copy.cites, { list })}</span>;
}

function CitedList({ c, items, view, copy }: { c: Case; items: CitedText[]; view: FindingView; copy: { cites: string; earlier: string; copy: string; copied: string } }) {
  return (
    <ul className="grid gap-1.5">
      {items.map((q, i) => (
        <li key={i} className="flex items-start justify-between gap-2 text-sm">
          <span>
            <span lang="en">{q.text}</span>
            <Cites c={c} ids={q.findingIds} view={view} copy={copy} />
          </span>
          <CopyButton text={q.text} labels={copy} />
        </li>
      ))}
    </ul>
  );
}

/** The evidence agent (an ADK workflow on Gemini): a reviewer runs it, it investigates and drafts; a person decides and sends. */
export async function AgentCard({ c, configured, view }: { c: Case; configured: boolean; view: FindingView }) {
  const { locale, m } = await getI18n();
  const t = m.agentCard;
  const run = c.agentRuns?.at(-1);
  const edits = run?.forensicReport?.length ?? 0;
  const copy = { cites: t.cites, earlier: t.earlier, copy: m.common.copy, copied: m.common.copied };
  return (
    <section aria-labelledby="agent-title" className="card overflow-hidden">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="max-w-xl">
          <h2 id="agent-title" className="font-semibold">
            {t.title} <span className="font-normal text-muted">{t.optional}</span>
          </h2>
          <p className="mt-0.5 text-sm text-muted">{t.body}</p>
        </div>
        <RunAgentButton caseId={c.id} disabled={!configured} copy={{ ...t.run, seconds: m.common.seconds, requestFailed: m.errors.requestFailed }} />
      </header>
      {!configured && (
        <p className="px-5 py-3 text-sm text-muted">
          {t.unavailable}
          <span className="tech-detail">{t.unavailableTech}</span>
        </p>
      )}
      {run ? (
        <div className="grid gap-4 px-5 py-4">
          <p className="text-xs text-muted">
            {rich(t.lastRun, { date: <DateTime iso={run.finishedAt} /> })}
            <span className="tech-detail">
              {" "}
              · {run.model}
              {run.model === "offline-demo-planner" ? t.offline : ""} · {format(t.version, { version: run.agentVersion })} · {formatPlural(locale, t.steps, run.steps.length)}
              {run.dropped.length ? ` · ${formatPlural(locale, t.dropped, run.dropped.length)}` : ""}
            </span>
          </p>
          {locale !== "en" && (run.reviewerSummary.length > 0 || run.sellerQuestions.length > 0 || run.issuerRequests.length > 0) ? <p className="text-xs text-muted">{t.aiNote}</p> : null}
          {run.reviewerSummary.length > 0 && (
            <div>
              <h3 className="label mb-1">{t.summary}</h3>
              <CitedList c={c} items={run.reviewerSummary} view={view} copy={copy} />
            </div>
          )}
          {run.sellerQuestions.length > 0 && (
            <div>
              <h3 className="label mb-1">{t.questions}</h3>
              <CitedList c={c} items={run.sellerQuestions} view={view} copy={copy} />
            </div>
          )}
          {run.issuerRequests.length > 0 && (
            <div>
              <h3 className="label mb-1">{t.emails}</h3>
              <p className="mb-2 text-xs text-muted">{t.emailsBody}</p>
              <ul className="grid gap-2">
                {run.issuerRequests.map((r, i) => (
                  <li key={i} className="rounded-lg border border-line bg-canvas p-3 text-sm">
                    <div className="flex justify-between gap-2 text-xs text-muted">
                      <span>{format(t.to, { to: r.to })}</span>
                      {/* The copied email is the agent's draft, in its language, ready to send. */}
                      <CopyButton text={`Subject: ${r.subject}\n\n${r.text}`} labels={copy} />
                    </div>
                    <div lang="en" className="mt-1 font-medium">
                      {r.subject}
                    </div>
                    <p className="mt-1">
                      <span lang="en">{r.text}</span>
                      <Cites c={c} ids={r.findingIds} view={view} copy={copy} />
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Link href={`/cases/${c.id}/agent`} className="btn btn-secondary justify-self-start">
            {edits ? formatPlural(locale, t.seeStepsEdits, edits) : t.seeSteps}
          </Link>
        </div>
      ) : (
        configured && <p className="px-5 py-4 text-sm text-muted">{t.notRun}</p>
      )}
    </section>
  );
}
