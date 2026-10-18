import Link from "next/link";
import { format } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import type { Case, ForensicDocumentReport } from "@/lib/types";

const PARTS = ["whatWasFound", "whatYouCanSee", "howSuchEditsAreMade", "innocentExplanations", "whatToRequest"] as const;

/**
 * Gemini's explanation of one flagged document, with the visual evidence next to it.
 * The explanation is the model's own English text, shown as written (lang="en").
 */
export async function ForensicReportCard({ c, report, showDocLink = true }: { c: Case; report: ForensicDocumentReport; showDocLink?: boolean }) {
  const { m } = await getI18n();
  const t = m.forensic;
  const codes = t.codes as Record<string, string>;
  const doc = c.documents.find((d) => d.id === report.documentId);
  const heatmap = doc?.forensics?.heatmapKey ? `/api/cases/${c.id}/documents/${report.documentId}/file?view=heatmap` : null;
  return (
    <article className="overflow-hidden rounded-xl border border-conflict-dot/40 bg-[#fdfcfa]">
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-line bg-conflict-bg/40 px-5 py-3">
        <div>
          <div className="text-xs font-semibold text-conflict-fg">{t.eyebrow}</div>
          <h3 className="mt-0.5 font-semibold">{report.filename}</h3>
        </div>
        <div className="text-right text-xs text-muted">
          {t.explainedBy}
          <span className="tech-detail">{format(t.model, { model: report.model })}</span>
          {showDocLink && (
            <div>
              <Link className="link" href={`/cases/${c.id}/documents/${report.documentId}`}>
                {t.open}
              </Link>
            </div>
          )}
        </div>
      </header>
      <div className="grid gap-4 px-5 py-4">
        <p lang="en" className="text-sm font-medium">
          {report.summary}
        </p>
        {heatmap && (
          <figure>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={heatmap} alt={format(t.heatmapAlt, { file: report.filename })} className="max-h-80 rounded-lg border border-line" />
            <figcaption className="mt-1 text-xs text-muted">{t.heatmapCaption}</figcaption>
          </figure>
        )}
        <ol className="grid gap-3">
          {report.findings.map((f, i) => (
            <li key={i} className="rounded-lg border border-line p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-conflict-bg px-2 py-0.5 text-xs font-semibold text-conflict-fg">{codes[f.indicatorCode] ?? f.indicatorCode}</span>
                {f.field && <span className="tech-detail text-xs text-muted">{format(t.field, { field: f.field })}</span>}
              </div>
              <dl className="grid gap-2 text-sm sm:grid-cols-[210px_1fr]">
                {PARTS.map((k) => (
                  <div key={k} className="contents">
                    <dt className="text-xs font-semibold text-muted">{t.parts[k]}</dt>
                    <dd lang="en">{f[k]}</dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ol>
        <p className="text-xs text-muted">
          {t.limits} <span lang="en">{report.limitations}</span> {t.limitsNote}
        </p>
      </div>
    </article>
  );
}
