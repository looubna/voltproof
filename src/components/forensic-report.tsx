import Link from "next/link";
import type { Case, ForensicDocumentReport } from "@/lib/types";

const PARTS: [keyof ForensicDocumentReport["findings"][number], string][] = [
  ["whatWasFound", "What the check found"],
  ["whatYouCanSee", "What you can see on the document"],
  ["howSuchEditsAreMade", "How this kind of edit is usually made"],
  ["innocentExplanations", "Innocent explanations"],
  ["whatToRequest", "What to ask for"],
];

const CODE_LABEL: Record<string, string> = {
  text_overlaps_text: "Text written over other text",
  unique_font: "Value in a substitute font",
  annotation_over_value: "Annotation laid over a value",
  signature_broken: "Digital signature broken",
  changed_after_signing: "Content added after signing",
  jpeg_ghost_mismatch: "Photo area that looks pasted in or retouched",
  duplicated_mark: "Stamp or signature copied digitally",
  instructions_to_ai: "Hidden instructions to AI systems",
};

/** Gemini's explanation of one flagged document, with the visual evidence next to it. */
export function ForensicReportCard({ c, report, showDocLink = true }: { c: Case; report: ForensicDocumentReport; showDocLink?: boolean }) {
  const doc = c.documents.find((d) => d.id === report.documentId);
  const heatmap = doc?.forensics?.heatmapKey ? `/api/cases/${c.id}/documents/${report.documentId}/file?view=heatmap` : null;
  return (
    <article className="overflow-hidden rounded-xl border border-conflict-dot/40 bg-[#fdfcfa]">
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-line bg-conflict-bg/40 px-5 py-3">
        <div>
          <div className="text-xs font-semibold text-conflict-fg">Analysis of possible edits</div>
          <h3 className="mt-0.5 font-semibold">{report.filename}</h3>
        </div>
        <div className="text-right text-xs text-muted">
          Explained by AI<span className="tech-detail"> ({report.model} on Vertex AI)</span>
          {showDocLink && (
            <div>
              <Link className="link" href={`/cases/${c.id}/documents/${report.documentId}`}>
                Open the document →
              </Link>
            </div>
          )}
        </div>
      </header>
      <div className="grid gap-4 px-5 py-4">
        <p className="text-sm font-medium">{report.summary}</p>
        {heatmap && (
          <figure>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={heatmap} alt={`Map of ${report.filename}: red marks the areas that look pasted in or retouched`} className="max-h-80 rounded-lg border border-line" />
            <figcaption className="mt-1 text-xs text-muted">The outlined value was not saved the same way as the rest of the photo. Red marks the parts that differ, which is how pasted-in or retouched areas show up.</figcaption>
          </figure>
        )}
        <ol className="grid gap-3">
          {report.findings.map((f, i) => (
            <li key={i} className="rounded-lg border border-line p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-conflict-bg px-2 py-0.5 text-xs font-semibold text-conflict-fg">{CODE_LABEL[f.indicatorCode] ?? f.indicatorCode}</span>
                {f.field && <span className="tech-detail text-xs text-muted">field: {f.field}</span>}
              </div>
              <dl className="grid gap-2 text-sm sm:grid-cols-[210px_1fr]">
                {PARTS.map(([k, label]) => (
                  <div key={k} className="contents">
                    <dt className="text-xs font-semibold text-muted">{label}</dt>
                    <dd>{f[k]}</dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ol>
        <p className="text-xs text-muted">Limits: {report.limitations} The explanation never changes a status: the checks above set it, and a person decides.</p>
      </div>
    </article>
  );
}
