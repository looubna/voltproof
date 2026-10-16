import { cookies } from "next/headers";
import Link from "next/link";
import { TechnicalToggle } from "@/components/technical-toggle";
import { PageTitle, StatusLegend } from "@/components/ui";
import { agentConfigured } from "@/lib/agent";
import { requireUser } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { PROVENANCE_LABEL } from "@/lib/labels";
import { ocrConfigured } from "@/lib/ocr/paddle";
import { TECHNICAL_COOKIE } from "@/lib/preferences";
import { CAR365_NAME, car365Status } from "@/lib/registry/car365";
import { ruleCheckTitles } from "@/lib/rules";
import { SAMPLE_CASES } from "@/lib/samples/definitions";

export const dynamic = "force-dynamic";

const STEPS = [
  { t: "1 · Upload", d: "You upload the seller's documents and say where each came from. Each file is stored with who uploaded it, when, and a fingerprint that shows it was not changed later." },
  { t: "2 · AI reads", d: "AI reads each document and notes the page and words behind every value. Anything it cannot find stays unknown; it never guesses." },
  { t: "3 · Rules decide", d: "Fixed rules compare the documents with each other and with the seller's claims, look for signs of editing, and set every status." },
  { t: "4 · People resolve", d: "You record a decision and a note on anything flagged. The check's own result is never overwritten." },
  { t: "5 · Report", d: "A report you can print or share, with the page behind every fact, your notes and what VoltProof could not confirm." },
];

const GLOSSARY: [string, string][] = [
  ["VIN", "Vehicle identification number: 17 letters and digits that identify one car. It is on a plate on the car and on the registration."],
  ["Registration number", "The car's number plate."],
  ["Odometer or mileage", "The distance the car has driven, as shown on the dashboard."],
  ["Battery health (SOH)", "State of health: how much of its original capacity the battery still holds, as a percentage. 100% is like new."],
  ["Battery report", "A test of the battery's health by a workshop or a test provider."],
  ["DC fast charging", "Charging at high power at public stations. A lot of it can wear a battery faster."],
  ["Seller's claim", "Something the seller says about the car, such as \"battery health 92%\" or \"no accidents\". Each claim is checked against the documents."],
  [
    "Where a document came from",
    `"${PROVENANCE_LABEL.seller_provided}", "${PROVENANCE_LABEL.dealer_captured}" (for example a dashboard photo your staff took) or "${PROVENANCE_LABEL.dealer_ordered}". Only readings your own staff captured can be Verified.`,
  ],
  ["Issuer", "The company that produced a document, such as the workshop that wrote an invoice or the insurer that keeps a claim record."],
  ["Confirmed with the issuer", "You contacted the issuer and they confirmed they produced the document. You record this on the document's page."],
  ["Digital signature", "A seal built into some PDF files that shows who issued the file and that it has not changed since. A stamp or signature printed on the page is not one."],
  ["Possible edit", "A check found signs that a value was changed after the document was made, such as text typed over other text. It is a reason to ask questions, not proof of fraud."],
  ["Review decision", "Your record of what you checked: Resolved, Unresolved or Needs more information, with a note. It is saved with your name and the time."],
  ["Evidence agent", "An optional AI assistant that drafts questions for the seller and emails to issuers. It cannot change a status or send anything."],
  ["Technical details", "A switch in your account menu (top right) that also shows AI model names, version numbers and file fingerprints."],
];

function countWord(n: number) {
  const words = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
  const w = words[n] ?? String(n);
  return w[0].toUpperCase() + w.slice(1);
}

export default async function AboutPage() {
  await requireUser();
  const cfg = getConfig();
  const technical = (await cookies()).get(TECHNICAL_COOKIE)?.value === "on";
  const checks = ruleCheckTitles();
  const car365 = car365Status(process.env.KR_CAR365_SERVICE_KEY);
  const samples = SAMPLE_CASES.map((s) => `${s.vehicle.make} ${s.vehicle.model}`);
  return (
    <>
      <PageTitle eyebrow="How VoltProof works" title="AI reads. Rules decide. People resolve.">
        VoltProof checks what a seller says about a used electric vehicle against the paperwork, and shows what is proven, what is only claimed and what is missing.
      </PageTitle>
      <ol className="mb-8 grid gap-3 md:grid-cols-5">
        {STEPS.map((s) => (
          <li key={s.t} className="card p-4">
            <div className="text-sm font-semibold">{s.t}</div>
            <p className="mt-1 text-sm leading-relaxed text-muted">{s.d}</p>
          </li>
        ))}
      </ol>

      <h2 id="statuses" className="mb-3 scroll-mt-6 text-lg font-semibold">
        The four statuses
      </h2>
      <div className="mb-8">
        <StatusLegend />
      </div>

      <section aria-labelledby="glossary" className="card mb-8 p-5">
        <h2 id="glossary" className="scroll-mt-6 text-lg font-semibold">
          Words you will see
        </h2>
        <dl className="mt-3 grid gap-x-8 gap-y-3 text-sm md:grid-cols-2">
          {GLOSSARY.map(([term, meaning]) => (
            <div key={term}>
              <dt className="font-semibold text-ink">{term}</dt>
              <dd className="mt-0.5 text-muted">{meaning}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="grid gap-6 md:grid-cols-3">
        <section className="card p-5 text-sm">
          <h2 className="mb-2 font-semibold">What it does today</h2>
          <ul className="grid list-disc gap-1 pl-5">
            <li>Cases, document uploads and a fingerprint of every file</li>
            <li>
              {countWord(checks.length)} checks on every case<span className="tech-detail"> ({checks.join(", ")})</span>, plus checks on each document for reading problems and possible edits
            </li>
            <li>The seller&apos;s claims, each with one of the four statuses</li>
            <li>A review step with a full history, and a report you can print</li>
            <li>Looking up the VIN in the US NHTSA database and the New Zealand vehicle register</li>
            <li>Recording that you confirmed a document with its issuer</li>
            <li>
              Reading documents with AI: <strong>{cfg.aiMode === "vertex" ? "on" : "off (demo mode)"}</strong>
              <span className="tech-detail">
                {" "}
                ({cfg.aiMode === "vertex" ? `${cfg.geminiModel} on Vertex AI${cfg.geminiFallbackModel ? `, fallback ${cfg.geminiFallbackModel}` : ""}` : "no model configured"})
              </span>
            </li>
            <li>
              A second reading of photos and scans: {ocrConfigured() ? "on" : "off"}
              <span className="tech-detail"> (PaddleOCR service)</span>
            </li>
            <li>
              Evidence agent: {agentConfigured() ? "available" : "not available"}
              <span className="tech-detail"> (ADK workflow on Gemini)</span>
            </li>
            <li className="tech-detail">Storage: {cfg.storage === "gcp" ? "Firestore + Cloud Storage" : "local disk (development)"}</li>
          </ul>
          <TechnicalToggle initial={technical} className="mt-3" />
        </section>
        <section className="card p-5 text-sm">
          <h2 className="mb-2 font-semibold">Demo cases</h2>
          <ul className="grid list-disc gap-1 pl-5">
            <li>
              {countWord(samples.length)} fictional cases ({samples.join(", ")}) with generated documents.{" "}
              <Link href="/dashboard" className="link">
                Open one from the dashboard
              </Link>
              .
            </li>
            <li>Their values were written for the demo, so no AI is needed to try them; their confidence scores are illustrative</li>
            <li>No real customer documents are needed to try the workflow</li>
          </ul>
        </section>
        <section className="card p-5 text-sm">
          <h2 className="mb-2 font-semibold">Not built yet</h2>
          <ul className="grid list-disc gap-1 pl-5">
            <li>
              {CAR365_NAME} lookups{car365.configured ? " (key present, not connected yet)" : ""}
            </li>
            <li>Per-vehicle checks with the NZ register; today only the first 11 VIN characters are checked</li>
            <li>Confirming documents with issuers automatically (today a person records the check)</li>
            <li>A library of genuine stamps and signatures to compare against</li>
            <li>Proven forgery detection</li>
            <li>Hiding personal details in shared reports</li>
            <li>Reviews for lenders (see below)</li>
          </ul>
        </section>
      </div>

      <section className="card mt-6 p-5 text-sm">
        <h2 className="mb-2 font-semibold">Who it is for</h2>
        <p>
          <strong>Now:</strong> dealership appraisers deciding whether to buy a used EV.
        </p>
        <p className="mt-1">
          <strong>Possibly later:</strong> lenders reviewing a used EV as loan collateral could reuse the same evidence summary, subject to validation and partnerships. VoltProof has no lender or
          insurer partners, uses only public registry data (no restricted government databases), and does not approve loans, set premiums, predict defaults, value vehicles or certify battery
          health.
        </p>
      </section>
    </>
  );
}
