import { NewCaseForm } from "@/components/client";
import { PageTitle } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { SAMPLE_CASES } from "@/lib/samples/definitions";

export const dynamic = "force-dynamic";

export default async function NewCasePage() {
  await requireUser();
  const cfg = getConfig();
  const maxMb = Math.round(cfg.maxUploadBytes / 1048576);
  return (
    <>
      <PageTitle eyebrow="Step 1" title="Create a vehicle review case">
        Enter the vehicle and upload the seller&apos;s paperwork and your own inspection photos.
      </PageTitle>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <NewCaseForm maxMb={maxMb} />
        <aside className="grid content-start gap-4">
          <div className={`card p-4 text-sm ${cfg.aiMode === "demo" ? "border-amber-200 bg-amber-50/60" : ""}`}>
            <div className="label mb-1">How documents are read</div>
            {cfg.aiMode === "vertex" ? (
              <p>
                Each document is sent to <strong>{cfg.geminiModel}</strong> on Vertex AI, which extracts fields with a page number and quote.
                Deterministic rules then compare the values.
              </p>
            ) : (
              <p>
                <strong>Demo mode.</strong> No AI service is configured, so no live extraction happens. The synthetic sample documents below
                are recognised by their fingerprint and use hand-written demo extractions. Any other file is stored and fingerprinted but not read.
              </p>
            )}
          </div>
          <div className="card p-4 text-sm">
            <div className="label mb-2">Synthetic sample documents</div>
            <p className="mb-3 text-xs text-muted">Fictional files for trying the upload flow. Download, then upload them here.</p>
            {SAMPLE_CASES.map((sc) => (
              <div key={sc.id} className="mb-3 last:mb-0">
                <div className="text-xs font-semibold">
                  {sc.vehicle.year} {sc.vehicle.make} {sc.vehicle.model} · VIN <span className="font-mono">{sc.vehicle.vin}</span>
                </div>
                <ul className="mt-1 grid gap-0.5">
                  {sc.docs.map((d) => (
                    <li key={d.id}>
                      <a className="link text-xs" href={`/api/samples/${d.filename}`}>
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
