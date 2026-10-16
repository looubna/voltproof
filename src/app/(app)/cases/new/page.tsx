import { NewCaseForm } from "@/components/client";
import { PageTitle } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getConfig, typicalReadSeconds } from "@/lib/config";
import { SAMPLE_CASES } from "@/lib/samples/definitions";

export const dynamic = "force-dynamic";

const NEXT_STEPS = [
  { n: 1, t: "Vehicle and documents", d: "Enter the car and upload the seller's paperwork (this page)." },
  { n: 2, t: "The seller's claims", d: "Paste the listing on the case page. Each claim is checked against the documents." },
  { n: 3, t: "Review and report", d: "Decide on anything flagged, then print or download the report." },
];

export default async function NewCasePage() {
  await requireUser();
  const cfg = getConfig();
  const maxMb = Math.round(cfg.maxUploadBytes / 1048576);
  return (
    <>
      <PageTitle eyebrow="New case" title="Start a vehicle review">
        Add the car and the seller&apos;s paperwork. VoltProof reads each document, checks the facts against each other and shows you what to look into.
      </PageTitle>
      <ol aria-label="How a review works" className="mb-6 grid gap-2 sm:grid-cols-3">
        {NEXT_STEPS.map((s) => (
          <li key={s.n} aria-current={s.n === 1 ? "step" : undefined} className={`flex gap-3 rounded-xl border bg-[#fdfcfa] p-3 ${s.n === 1 ? "border-brand-600 ring-1 ring-brand-600" : "border-line"}`}>
            <span aria-hidden className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${s.n === 1 ? "bg-brand-600 text-white" : "bg-unknown-bg text-unknown-fg"}`}>
              {s.n}
            </span>
            <div>
              <p className="text-sm font-semibold">{s.t}</p>
              <p className="text-xs text-muted">{s.d}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <NewCaseForm maxMb={maxMb} typicalSeconds={typicalReadSeconds(cfg)} />
        <aside className="grid content-start gap-4">
          <div className={`card p-4 text-sm ${cfg.aiMode === "demo" ? "border-amber-200 bg-amber-50/60" : ""}`}>
            <h2 className="label mb-1">How documents are read</h2>
            {cfg.aiMode === "vertex" ? (
              <p>
                AI reads each document and notes the page and words behind every value it finds. Fixed rules then compare the values; the AI never decides a status. Reading takes about a minute per
                document.
                <span className="tech-detail text-muted"> Model: {cfg.geminiModel} on Vertex AI.</span>
              </p>
            ) : (
              <p>
                <strong>Demo mode.</strong> No AI is connected, so only the sample documents below are read, using values written for the demo. Any other file is stored and fingerprinted but not
                read.
              </p>
            )}
          </div>
          <div className="card p-4 text-sm">
            <h2 className="label mb-1">Sample documents to try</h2>
            <p className="mb-3 text-xs text-muted">Fictional files for practice. Download a set, then upload it here with the car&apos;s details.</p>
            {SAMPLE_CASES.map((sc) => (
              <div key={sc.id} className="mb-3 last:mb-0">
                <div className="text-xs font-semibold">
                  {sc.vehicle.year} {sc.vehicle.make} {sc.vehicle.model} · VIN <span className="font-mono">{sc.vehicle.vin}</span>
                </div>
                <ul className="mt-1 grid gap-0.5">
                  {sc.docs.map((d) => (
                    <li key={d.id}>
                      <a className="link text-xs" href={`/api/samples/${d.filename}`} download>
                        {d.filename}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </>
  );
}
