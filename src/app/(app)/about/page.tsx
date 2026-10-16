import { PageTitle, StatusLegend } from "@/components/ui";
import { agentConfigured } from "@/lib/agent";
import { requireUser } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { ocrConfigured } from "@/lib/ocr/paddle";
import { CAR365_NAME, car365Status } from "@/lib/registry/car365";
import { ruleCheckTitles } from "@/lib/rules";
import { SAMPLE_CASES } from "@/lib/samples/definitions";

export const dynamic = "force-dynamic";

const STEPS = [
  { t: "1 · Intake", d: "Documents are stored with uploader, time, source and a SHA-256 fingerprint." },
  { t: "2 · Gemini reads", d: "Gemini on Vertex AI extracts fields as schema-validated JSON, each with page, quote and confidence. Missing values stay unknown." },
  { t: "3 · Rules decide", d: "Deterministic code compares VINs, plates, make/model, mileage over time, dates and battery reports, checks the documents for signs of editing, and sets every status." },
  { t: "4 · People resolve", d: "A reviewer records a decision and note on each conflict. The machine finding is never overwritten." },
  { t: "5 · Report", d: "A traceable summary with page references, reviewer notes and the authenticity limitation." },
];

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
/** "Ten", "Five": counts in prose, so they come from the code rather than being typed in. */
function countWord(n: number) {
  const w = NUMBER_WORDS[n] ?? String(n);
  return w[0].toUpperCase() + w.slice(1);
}

export default async function AboutPage() {
  await requireUser();
  const cfg = getConfig();
  const checks = ruleCheckTitles();
  const car365 = car365Status(process.env.KR_CAR365_SERVICE_KEY);
  const samples = SAMPLE_CASES.map((s) => `${s.vehicle.make} ${s.vehicle.model}`);
  return (
    <>
      <PageTitle eyebrow="How VoltProof works" title="Gemini reads. Rules decide. People resolve." />
      <div className="mb-8 grid gap-3 md:grid-cols-5">
        {STEPS.map((s) => (
          <div key={s.t} className="card p-4">
            <div className="text-sm font-semibold">{s.t}</div>
            <p className="mt-1 text-xs leading-relaxed text-muted">{s.d}</p>
          </div>
        ))}
      </div>

      <h2 className="mb-3 text-lg font-semibold">The four statuses</h2>
      <div className="mb-8">
        <StatusLegend />
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <section className="card p-5 text-sm">
          <h2 className="mb-2 font-semibold">Live in this deployment</h2>
          <ul className="grid list-disc gap-1 pl-5">
            <li>Case creation, upload with type and size checks, SHA-256 fingerprints</li>
            <li>
              {countWord(checks.length)} deterministic rule checks on every case ({checks.join(", ")}), plus per-document checks of extraction quality, possible edits and
              digital signatures
            </li>
            <li>Seller claims read from a listing and given one of the four statuses</li>
            <li>Decision Impact, review queue with an append-only audit trail, printable report</li>
            <li>Forensic checks for signs of editing, and digital signatures checked against a trust list</li>
            <li>VIN decoding with NHTSA vPIC, and the NZ Motor Vehicle Register (open data, by VIN prefix)</li>
            <li>Recording a check with a document&apos;s issuer, which counts towards authenticity</li>
            <li>
              AI extraction:{" "}
              {cfg.aiMode === "vertex" ? (
                <strong>
                  live, {cfg.geminiModel} on Vertex AI{cfg.geminiFallbackModel ? ` (fallback ${cfg.geminiFallbackModel})` : ""}
                </strong>
              ) : (
                <strong>not configured (demo mode)</strong>
              )}
            </li>
            <li>Second OCR read (PaddleOCR) for photos and scans: {ocrConfigured() ? "connected" : "not configured"}</li>
            <li>Evidence agent (ADK): {agentConfigured() ? "connected" : "not configured"}</li>
            <li>Storage: {cfg.storage === "gcp" ? "Firestore + Cloud Storage" : "local disk (development)"}</li>
          </ul>
        </section>
        <section className="card p-5 text-sm">
          <h2 className="mb-2 font-semibold">Synthetic demonstration data</h2>
          <ul className="grid list-disc gap-1 pl-5">
            <li>
              {countWord(samples.length)} fictional cases ({samples.join(", ")}) with generated documents
            </li>
            <li>In demo mode, their extractions are hand-written fixtures; confidence values shown for them are illustrative</li>
            <li>No real customer documents are needed to try the workflow</li>
          </ul>
        </section>
        <section className="card p-5 text-sm">
          <h2 className="mb-2 font-semibold">Not built yet (future)</h2>
          <ul className="grid list-disc gap-1 pl-5">
            <li>
              {CAR365_NAME} lookups{car365.configured ? " (key present, adapter not yet connected)" : ""}
            </li>
            <li>Per-vehicle NZ register checks (NZTA Motochek); the open data covers VIN prefixes only</li>
            <li>Confirming documents with issuers automatically (today a person records the check)</li>
            <li>A reference library of genuine stamps and signatures</li>
            <li>Validated forgery detection</li>
            <li>Masking personal data in shared reports</li>
            <li>Lender collateral review (see below)</li>
          </ul>
        </section>
      </div>

      <section className="card mt-6 p-5 text-sm">
        <h2 className="mb-2 font-semibold">Who it is for</h2>
        <p>
          <strong>Now (MVP):</strong> dealership appraisers deciding whether to purchase a used EV.
        </p>
        <p className="mt-1">
          <strong>Possible later:</strong> lenders reviewing a used EV as loan collateral could reuse the same traceable evidence summary, subject to validation and partnerships.
          VoltProof has no lender or insurer partners, uses only public registry data (no restricted government databases), and does not approve loans, set premiums, predict
          defaults, value vehicles or certify battery health.
        </p>
      </section>
    </>
  );
}
