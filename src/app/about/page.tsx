import { PageTitle, StatusLegend } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

const STEPS = [
  { t: "1 · Intake", d: "Documents are stored with uploader, time, source and a SHA-256 fingerprint." },
  { t: "2 · Gemini reads", d: "Gemini on Vertex AI extracts fields as schema-validated JSON, each with page, quote and confidence. Missing values stay unknown." },
  { t: "3 · Rules decide", d: "Deterministic code compares VINs, make/model, mileage over time, dates, battery report VIN and age, and sets every status." },
  { t: "4 · People resolve", d: "A reviewer records a decision and note on each conflict. The machine finding is never overwritten." },
  { t: "5 · Report", d: "A traceable summary with page references, reviewer notes and the authenticity limitation." },
];

export default async function AboutPage() {
  await requireUser();
  const cfg = getConfig();
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
            <li>Six deterministic rule checks and the four statuses</li>
            <li>Decision Impact, review queue with an append-only audit trail, printable report</li>
            <li>Basic file-integrity indicators (potential signs only)</li>
            <li>
              AI extraction:{" "}
              {cfg.aiMode === "vertex" ? <strong>live, {cfg.geminiModel} on Vertex AI</strong> : <strong>not configured (demo mode)</strong>}
            </li>
            <li>Storage: {cfg.storage === "gcp" ? "Firestore + Cloud Storage" : "local disk (development)"}</li>
          </ul>
        </section>
        <section className="card p-5 text-sm">
          <h2 className="mb-2 font-semibold">Synthetic demonstration data</h2>
          <ul className="grid list-disc gap-1 pl-5">
            <li>Three fictional cases (Kia EV6, Hyundai Ioniq 5, Tesla Model 3) with generated documents</li>
            <li>In demo mode, their extractions are hand-written fixtures; confidence values shown for them are illustrative</li>
            <li>No real customer documents are needed to try the workflow</li>
          </ul>
        </section>
        <section className="card p-5 text-sm">
          <h2 className="mb-2 font-semibold">Not built yet (future)</h2>
          <ul className="grid list-disc gap-1 pl-5">
            <li>Confirming documents with their issuer (e.g. battery test providers)</li>
            <li>Official registry or history-record lookups, where permitted</li>
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
          VoltProof has no lender or insurer partners, does not access government databases, and does not approve loans, set premiums, predict defaults, value vehicles or certify
          battery health.
        </p>
      </section>
    </>
  );
}
