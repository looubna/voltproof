import Link from "next/link";
import { ReprocessButton } from "@/components/client";
import { CaseHeader, loadCase } from "@/components/case-header";
import { FindingCard, StatusBadge, StatusLegend, docHref } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { currentFindings, latestRun, reviewState } from "@/lib/derive";
import { DOC_TYPE_LABEL, EXTRACTION_STATUS_LABEL, FIELD_LABEL, PROVENANCE_LABEL } from "@/lib/labels";
import { formatOdometer } from "@/lib/normalize";
import { AUTHENTICITY_STATEMENT } from "@/lib/report";
import type { CaseDocument, ExtractedField, FieldName, GroundingResult, Odometer } from "@/lib/types";

export const dynamic = "force-dynamic";

function show(name: FieldName, f: ExtractedField<unknown>) {
  if (f.value === null) return null;
  if (name === "odometer") return formatOdometer(f.value as Odometer);
  if (name === "documentType") return DOC_TYPE_LABEL[f.value as keyof typeof DOC_TYPE_LABEL] ?? String(f.value);
  if (name === "batterySohPercent") return `${f.value}%`;
  return String(f.value);
}

const GROUNDING_TEXT: Record<GroundingResult, { text: string; cls: string; title: string }> = {
  exact: { text: "found in PDF", cls: "bg-verified-bg text-verified-fg", title: "The quote appears word for word in the document's text on the cited page." },
  fuzzy: { text: "found (close match)", cls: "bg-verified-bg text-verified-fg", title: "The quote closely matches the document's text (small spacing or character differences)." },
  other_page: { text: "found on another page", cls: "bg-consistent-bg text-consistent-fg", title: "The quote appears in the document, on a different page than cited. The page was corrected." },
  not_found: { text: "quote not found", cls: "bg-conflict-bg text-conflict-fg", title: "The quote does not appear in the document's text, so the value is not used by any check." },
  not_checked: { text: "not machine-checked", cls: "bg-unknown-bg text-unknown-fg", title: "Images and scans have no text layer to check the quote against. Compare it with the image yourself." },
};

function GroundingTag({ g }: { g: GroundingResult }) {
  const t = GROUNDING_TEXT[g];
  return (
    <span title={t.title} className={`ml-1.5 inline-block whitespace-nowrap rounded-full px-1.5 py-px text-[10px] font-semibold not-italic ${t.cls}`}>
      {t.text}
    </span>
  );
}

function ExtractedFields({ caseId, doc, canReread }: { caseId: string; doc: CaseDocument; canReread: boolean }) {
  const ex = doc.extraction;
  const names = ex ? (Object.keys(ex.fields) as FieldName[]) : [];
  const found = names.filter((n) => ex!.fields[n].value !== null);
  const missing = names.filter((n) => ex!.fields[n].value === null);
  return (
    <article className="card overflow-hidden">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-3">
        <div>
          <Link href={`/cases/${caseId}/documents/${doc.id}`} className="link break-all font-semibold">
            {doc.filename}
          </Link>
          <div className="mt-0.5 text-xs text-muted">
            {PROVENANCE_LABEL[doc.provenance]} · uploaded by {doc.uploadedBy}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 text-xs">
          {ex ? (
            ex.mode === "demo-fixture" ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800">Demo fixture · not a live AI call</span>
            ) : (
              <span className="rounded-full bg-brand-100 px-2 py-0.5 font-medium text-brand-700">Read by {ex.model} · live</span>
            )
          ) : (
            <span className="font-medium text-conflict-fg">{EXTRACTION_STATUS_LABEL[doc.extractionStatus]}</span>
          )}
          {canReread && <ReprocessButton caseId={caseId} docId={doc.id} label={ex?.mode === "vertex-gemini" ? "Re-read with Gemini" : "Read with Gemini"} />}
        </div>
      </header>
      {doc.extractionError && <p className="border-b border-line bg-conflict-bg/40 px-5 py-2 text-xs text-conflict-fg">{doc.extractionError}</p>}
      {ex && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-canvas text-xs text-muted">
              <tr>
                <th className="px-5 py-2 font-medium">Field</th>
                <th className="px-3 py-2 font-medium">Value</th>
                <th className="px-3 py-2 font-medium">Source · supporting quote</th>
                <th className="px-3 py-2 font-medium">Confidence{ex.mode === "demo-fixture" ? " (illustrative)" : " (self-reported)"}</th>
                <th className="px-3 py-2 font-medium">Used by checks</th>
              </tr>
            </thead>
            <tbody>
              {found.map((n) => {
                const f = ex.fields[n];
                const href = docHref(caseId, { documentId: doc.id, page: f.page, quote: f.quote });
                return (
                  <tr key={n} className="border-t border-line align-top">
                    <td className="px-5 py-2 text-muted">{FIELD_LABEL[n]}</td>
                    <td className="px-3 py-2 font-mono text-[13px]">{show(n, f)}</td>
                    <td className="px-3 py-2 text-xs">
                      <Link href={href!} className="link mr-1 font-medium">
                        p.{f.page ?? "?"}
                      </Link>
                      {f.quote ? <q className="italic text-muted">{f.quote}</q> : <span className="text-conflict-fg">No quote</span>}
                      {f.grounded ? <GroundingTag g={f.grounded} /> : null}
                      {f.tamperIndicator ? <div className="mt-1 rounded bg-conflict-bg px-2 py-1 not-italic text-conflict-fg">Possible edit: {f.tamperIndicator}</div> : null}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{f.confidence !== null ? f.confidence.toFixed(2) : "—"}</td>
                    <td className="px-3 py-2 text-xs">{f.supported ? <span className="text-verified-fg">Yes</span> : <span className="text-conflict-fg">No — {f.unsupportedReason}</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {missing.length > 0 && (
            <p className="border-t border-line px-5 py-2 text-xs text-muted">
              Not present in this document (recorded as unknown, never guessed): {missing.map((n) => FIELD_LABEL[n]).join(", ")}.
            </p>
          )}
          {ex.warnings.length > 0 && <p className="border-t border-line px-5 py-2 text-xs text-conflict-fg">Validation warnings: {ex.warnings.join("; ")}</p>}
        </div>
      )}
    </article>
  );
}

export default async function EvidencePage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const c = await loadCase(id);
  const cfg = getConfig();
  const run = latestRun(c);
  const findings = currentFindings(c);
  const rules = findings.filter((f) => ["vehicle_identity", "odometer", "dates", "battery"].includes(f.category));
  const extraction = findings.filter((f) => f.category === "extraction");
  const integrity = findings.filter((f) => f.category === "integrity" || f.ruleId === "pdf_signature");
  const authenticity = findings.find((f) => f.id === "authenticity");
  const claims = findings.filter((f) => f.claim);

  return (
    <>
      <CaseHeader c={c} active="evidence" />

      {claims.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-1 text-lg font-semibold">Seller claims</h2>
          <p className="mb-4 text-sm text-muted">
            Each claim gets one status from the evidence below (claim assessor {run?.assessorVersion ?? "—"}). Gemini reads the documents; it never sets a status.
          </p>
          <div className="grid gap-4">
            {claims.map((f) => (
              <FindingCard key={f.id} caseId={c.id} finding={f} review={reviewState(c, f)} />
            ))}
          </div>
        </section>
      )}

      <section className="mb-10">
        <h2 className="mb-1 text-lg font-semibold">1 · Extracted information</h2>
        <p className="mb-4 text-sm text-muted">
          What was read from each document, with the page and quote behind every value. Values without a quote or below the {cfg.minConfidence} confidence threshold are not used by the checks.
        </p>
        <div className="grid gap-4">
          {c.documents.length === 0 ? <p className="text-sm text-muted">No documents yet.</p> : null}
          {c.documents.map((d) => (
            <ExtractedFields key={d.id} caseId={c.id} doc={d} canReread={cfg.aiMode === "vertex"} />
          ))}
        </div>
      </section>

      <section className="mb-10">
        <h2 className="mb-1 text-lg font-semibold">2 · Rule checks</h2>
        <p className="mb-4 text-sm text-muted">
          Statuses are set by deterministic rules (version {run?.rulesVersion ?? "—"}, last run {run ? new Date(run.at).toLocaleString("en-GB") : "—"}), never by the AI model.
        </p>
        <div className="mb-4">
          <StatusLegend />
        </div>
        <div className="grid gap-4">
          {rules.map((f) => (
            <FindingCard key={f.id} caseId={c.id} finding={f} review={reviewState(c, f)} />
          ))}
          {extraction.map((f) => (
            <FindingCard key={f.id} caseId={c.id} finding={f} review={reviewState(c, f)} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-lg font-semibold">3 · Document integrity and authenticity</h2>
        <p className="mb-4 text-sm text-muted">Three different questions. A clean answer to the first two does not answer the third.</p>
        <div className="grid gap-4">
          <div className="card p-5">
            <div className="label">A · Cross-document inconsistencies</div>
            <p className="mt-1 text-sm">Do the documents agree with each other? Checked by the rules above.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {rules.map((f) => (
                <a key={f.id} href={`#${f.id}`} className="inline-flex items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-xs hover:bg-brand-50">
                  {f.title} <StatusBadge status={f.status} size="sm" />
                </a>
              ))}
            </div>
          </div>

          <div className="card p-5">
            <div className="label">B · Possible signs of alteration (basic file checks)</div>
            <p className="mt-1 text-sm">
              Checks file type against extension, editing-software markers and PDF revision history. Findings are <strong>potential indicators only</strong>. These checks cannot
              detect a well-made forgery, and harmless re-saving can trigger them. The SHA-256 fingerprint proves only that the file has not changed since upload.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-muted">
                  <tr className="border-b border-line">
                    <th className="py-1.5 pr-3 font-medium">Document</th>
                    <th className="py-1.5 pr-3 font-medium">SHA-256 (at upload)</th>
                    <th className="py-1.5 pr-3 font-medium">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {c.documents.map((d) => {
                    const pot = d.integrity.indicators.filter((i) => i.severity === "potential");
                    const info = d.integrity.indicators.filter((i) => i.severity === "info");
                    return (
                      <tr key={d.id} className="border-b border-line/70 align-top last:border-0">
                        <td className="py-2 pr-3 break-all">{d.filename}</td>
                        <td className="py-2 pr-3 font-mono text-xs text-muted" title={d.integrity.sha256}>
                          {d.integrity.sha256.slice(0, 16)}…
                        </td>
                        <td className="py-2 pr-3 text-xs">
                          {pot.length ? (
                            <ul className="grid gap-1 text-conflict-fg">
                              {pot.map((i) => (
                                <li key={i.code}>Potential indicator: {i.message}</li>
                              ))}
                            </ul>
                          ) : (
                            <span className="text-muted">No indicators found by these basic checks. This is not proof of authenticity.</span>
                          )}
                          {info.map((i) => (
                            <div key={i.code} className="mt-1 text-muted">Note: {i.message}</div>
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
                  <FindingCard key={f.id} caseId={c.id} finding={f} review={reviewState(c, f)} />
                ))}
              </div>
            )}
          </div>

          <div className="card border-conflict-dot/30 p-5" id="authenticity">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="label">C · Authenticity verification</div>
              {authenticity ? <StatusBadge status={authenticity.status} /> : null}
            </div>
            <p className="mt-2 text-base font-semibold">{authenticity?.title ?? "Authenticity not verified"}</p>
            <p className="mt-1 text-sm">{authenticity?.result}</p>
            <ul className="mt-3 grid gap-1 text-sm">
              {c.documents.map((d) => (
                <li key={d.id} className="flex flex-wrap justify-between gap-2 border-b border-line/70 py-1.5 last:border-0">
                  <span className="break-all">{d.filename}</span>
                  <span className="text-muted">
                    <Link className="link" href={`/cases/${c.id}/documents/${d.id}`}>
                      {authenticity?.evidence.find((e) => e.documentId === d.id)?.value ?? "Not performed"}
                    </Link>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">{AUTHENTICITY_STATEMENT}</p>
            <p className="mt-1 text-xs text-muted">Issuer verification (for example, confirming a battery report with its test provider) is a planned integration and is not available yet.</p>
          </div>
        </div>
      </section>
    </>
  );
}
