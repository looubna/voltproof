import Link from "next/link";
import { notFound } from "next/navigation";
import { VerificationForm } from "@/components/client";
import { CaseHeader, loadCase } from "@/components/case-header";
import { fmtDateTime } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { DOC_TYPE_LABEL, EXTRACTION_STATUS_LABEL, FIELD_LABEL, PROVENANCE_LABEL } from "@/lib/labels";
import { formatOdometer } from "@/lib/normalize";
import type { FieldName, ForensicMethod, Odometer } from "@/lib/types";

const METHOD_LABEL: Record<ForensicMethod, string> = {
  pdf_text_layer: "PDF text-layer check",
  pdf_annotation: "annotation check",
  pdf_signature: "digital signature check",
  jpeg_ghost: "JPEG compression-history check",
  ink_marks: "stamp and signature duplicate check",
};

export const dynamic = "force-dynamic";

export default async function DocumentPage({ params, searchParams }: { params: Promise<{ id: string; docId: string }>; searchParams: Promise<{ page?: string; quote?: string }> }) {
  await requireUser();
  const { id, docId } = await params;
  const sp = await searchParams;
  const c = await loadCase(id);
  const d = c.documents.find((x) => x.id === docId);
  if (!d) notFound();
  const page = Math.max(1, Number(sp.page) || 1);
  const quote = sp.quote?.slice(0, 300);
  const src = `/api/cases/${c.id}/documents/${d.id}/file`;
  const isPdf = d.mimeType === "application/pdf";
  const ex = d.extraction;

  return (
    <>
      <CaseHeader c={c} active="evidence" />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="break-all text-lg font-semibold">{d.filename}</h2>
          <p className="text-sm text-muted">
            {ex?.fields.documentType.value ? DOC_TYPE_LABEL[ex.fields.documentType.value] : "Type not determined"} · {PROVENANCE_LABEL[d.provenance]} · uploaded {fmtDateTime(d.uploadedAt)} by {d.uploadedBy}
          </p>
        </div>
        <a href={src} target="_blank" rel="noreferrer" className="btn btn-secondary">
          Open original in new tab
        </a>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="card overflow-hidden">
          {quote && (
            <div className="border-b border-line bg-conflict-bg/50 px-4 py-2 text-sm">
              <span className="font-medium">Look on page {page} for:</span> <mark className="bg-amber-200/80 px-1 font-mono text-[13px]">{quote}</mark>
            </div>
          )}
          {isPdf ? (
            <iframe key={page} src={`${src}#page=${page}&view=FitH`} title={d.filename} className="h-[75vh] w-full bg-canvas" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt={`Uploaded document ${d.filename}`} className="w-full bg-canvas object-contain" />
          )}
        </div>

        <aside className="grid content-start gap-4">
          <section className="card p-4">
            <div className="label mb-2">Extracted values</div>
            {!ex ? (
              <p className="text-sm text-muted">{EXTRACTION_STATUS_LABEL[d.extractionStatus]}. {d.extractionError}</p>
            ) : (
              <>
                <p className="mb-2 text-xs text-muted">{ex.mode === "demo-fixture" ? "Demo fixture (hand-written, not a live AI call)" : `Read by ${ex.model} on ${fmtDateTime(ex.extractedAt)}`}</p>
                <ul className="grid gap-2 text-sm">
                  {(Object.keys(ex.fields) as FieldName[])
                    .filter((n) => ex.fields[n].value !== null)
                    .map((n) => {
                      const f = ex.fields[n];
                      const v = n === "odometer" ? formatOdometer(f.value as Odometer) : n === "documentType" ? DOC_TYPE_LABEL[f.value as keyof typeof DOC_TYPE_LABEL] : String(f.value);
                      const active = quote && f.quote === quote;
                      const q = new URLSearchParams({ page: String(f.page ?? 1), ...(f.quote ? { quote: f.quote } : {}) });
                      return (
                        <li key={n} className={`rounded-lg border px-3 py-2 ${active ? "border-amber-400 bg-amber-50" : "border-line"}`}>
                          <div className="flex justify-between gap-2 text-xs text-muted">
                            <span>{FIELD_LABEL[n]}</span>
                            <Link className="link" href={`?${q}`}>p.{f.page ?? "?"}</Link>
                          </div>
                          <div className="font-mono text-[13px]">{v}</div>
                          {f.quote && <q className="text-xs italic text-muted">{f.quote}</q>}
                          {!f.supported && <div className="text-xs text-conflict-fg">Not used by checks: {f.unsupportedReason}</div>}
                          {f.tamperIndicator && <div className="mt-1 rounded bg-conflict-bg px-2 py-1 text-xs text-conflict-fg">Possible edit: {f.tamperIndicator}</div>}
                        </li>
                      );
                    })}
                </ul>
              </>
            )}
          </section>
          <section className="card p-4 text-xs">
            <div className="label mb-2">File record</div>
            <dl className="grid gap-1">
              <dt className="text-muted">SHA-256 at upload</dt>
              <dd className="break-all font-mono">{d.integrity.sha256}</dd>
              <dt className="mt-1 text-muted">Detected type</dt>
              <dd>{d.integrity.detectedType.toUpperCase()} · {(d.sizeBytes / 1024).toFixed(0)} KB</dd>
              <dt className="mt-1 text-muted">Basic integrity checks</dt>
              <dd>
                {d.integrity.indicators.filter((i) => i.severity === "potential").length
                  ? d.integrity.indicators.filter((i) => i.severity === "potential").map((i) => <p key={i.code} className="text-conflict-fg">Potential indicator: {i.message}</p>)
                  : "No indicators found (not proof of authenticity)."}
              </dd>
              <dt className="mt-1 text-muted">Forensic checks</dt>
              <dd>
                {!d.forensics ? (
                  "Not run."
                ) : (
                  <>
                    <span className="text-muted">Ran: {d.forensics.methods.length ? d.forensics.methods.map((m) => METHOD_LABEL[m]).join(", ") : "none applicable to this file"}.</span>
                    {d.forensics.indicators.filter((i) => i.severity === "potential").map((i, k) => (
                      <p key={k} className="text-conflict-fg">Potential indicator: {i.message}</p>
                    ))}
                    {!d.forensics.indicators.some((i) => i.severity === "potential") && <p>No signs of editing found (not proof of authenticity).</p>}
                  </>
                )}
              </dd>
              <dt className="mt-1 text-muted">Digital signature</dt>
              <dd>
                {d.forensics?.signatures.length
                  ? d.forensics.signatures.map((x, k) => (
                      <p key={k} className={x.integrity === "invalid" ? "text-conflict-fg" : x.trustedAs && x.coversWholeFile ? "text-verified-fg" : ""}>
                        {x.signer ?? "Unknown signer"}: {x.detail}
                      </p>
                    ))
                  : "None. A visible stamp or signature on the page is not a cryptographic signature and proves nothing by itself."}
              </dd>
              <dt className="mt-1 text-muted">Issuer verification</dt>
              <dd>
                {d.verifications?.length
                  ? [...d.verifications].reverse().map((v) => (
                      <p key={v.id} className={v.outcome === "denied" ? "text-conflict-fg" : v.outcome === "confirmed" ? "text-verified-fg" : ""}>
                        {v.outcome === "confirmed" ? "Confirmed" : v.outcome === "denied" ? "Denied" : "No response"} — {v.contact}
                        {v.reference ? `, ref. ${v.reference}` : ""} ({v.method.replace(/_/g, " ")}), recorded by {v.by} {fmtDateTime(v.at)}
                        {v.note ? `: “${v.note}”` : ""}
                      </p>
                    ))
                  : "Not performed — authenticity not verified."}
              </dd>
              {d.extractionHistory.length > 0 && (
                <>
                  <dt className="mt-1 text-muted">Earlier extractions kept</dt>
                  <dd>{d.extractionHistory.map((h) => `${h.mode === "demo-fixture" ? "demo fixture" : h.model} (${fmtDateTime(h.extractedAt)})`).join("; ")}</dd>
                </>
              )}
            </dl>
          </section>
          <section className="card p-4">
            <div className="label mb-1">Check with the issuer</div>
            <p className="mb-3 text-xs text-muted">Contact the workshop, test provider or registry yourself, using contact details you found independently (not the ones printed on this document), and record what they said.</p>
            <VerificationForm caseId={c.id} docId={d.id} />
          </section>
        </aside>
      </div>
    </>
  );
}
