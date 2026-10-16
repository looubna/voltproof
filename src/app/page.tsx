// Public landing page (from the VoltProof landing page design). The waitlist and
// demo forms post to /api/leads; "See the live demo" opens the signed-in app.
import { LogoMark } from "@/components/logo";
import Link from "next/link";
import { DemoRequestForm, WaitlistForm } from "@/components/client";
import { StatusBadge } from "@/components/ui";
import type { Status } from "@/lib/types";

// Rendered per request so its inline scripts carry the Content-Security-Policy nonce (see src/middleware.ts).
export const dynamic = "force-dynamic";

const NAVY = "bg-[#0f1c2b]";
const PAPER = "bg-[#f3f1ec]";

function Logo({ light = true }: { light?: boolean }) {
  return (
    <span className={`flex items-center gap-2 text-lg font-semibold tracking-tight ${light ? "text-white" : "text-[#0f1c2b]"}`}>
      <LogoMark />
      VoltProof
    </span>
  );
}

const SAMPLE: { label: string; status: Status; note: string }[] = [
  { label: "Battery health: 92% claimed", status: "verified", note: "Matches a diagnostic readout from the last 30 days." },
  { label: "Mileage: 48,200 km", status: "consistent", note: "In line with service and registration records." },
  { label: "Accident history: seller says none", status: "conflict", note: "An insurance record lists one repair claim." },
  { label: "Fast-charging history", status: "unknown", note: "No charging data provided yet." },
];

const STATUS_TEXT: [Status, string][] = [
  ["verified", "An independent source confirms the claim."],
  ["consistent", "The records agree with the claim, but none proves it outright."],
  ["conflict", "A source contradicts the claim. Worth a question before you pay."],
  ["unknown", "No evidence either way yet. Missing, not wrong."],
];

const FAQ: [string, string][] = [
  ["Is VoltProof available now?", "We have just launched and are opening early access in small groups. Join the waitlist and we'll email you when your spot opens."],
  ["Should I join the waitlist or request a demo?", "Join the waitlist if you want to hear when VoltProof opens. Request a demo if your team buys, sells, finances or insures used EVs and wants to see a sample report for your use case."],
  ["What does an evidence report cover?", "The claims made about a vehicle, such as battery health, mileage, accident history and charging. Each one gets a status (Verified, Consistent, Conflict or Unknown) and the source behind it."],
  ["How do you spot edited documents?", "VoltProof checks each file for signs of editing: text written over other text, values in a substitute font, broken digital signatures, photo areas without the photo's compression history and copied stamps. A visible stamp or signature alone is never treated as proof."],
  ["How much will it cost?", "We'll share pricing with early-access partners first."],
  ["What do you do with my details?", "We use them only to contact you about VoltProof. We don't sell them, and you can unsubscribe at any time."],
];

export default function Landing() {
  return (
    <div className="text-[#16202c]">
      {/* Hero */}
      <section className={`${NAVY} text-white`}>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <Logo />
          <nav className="hidden gap-6 text-sm text-white/75 md:flex">
            <a href="#how" className="hover:text-white">How it works</a>
            <a href="#statuses" className="hover:text-white">Evidence statuses</a>
            <a href="#who" className="hover:text-white">Who it's for</a>
            <a href="#team" className="hover:text-white">Team</a>
            <a href="#faq" className="hover:text-white">FAQ</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login" className="hidden text-sm text-white/80 hover:text-white sm:block">Sign in</Link>
            <a href="#demo" className="rounded-lg bg-[#7fd3b2] px-4 py-2 text-sm font-semibold text-[#0f1c2b] hover:bg-[#95ddc0]">Request a demo</a>
          </div>
        </div>
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-20 pt-10 lg:grid-cols-2">
          <div>
            <p className="mb-4 flex items-center gap-2 text-sm font-semibold text-[#7fd3b2]"><span className="h-2 w-2 rounded-sm bg-[#7fd3b2]" />Just launched · Early access is open</p>
            <h1 className="text-4xl font-bold leading-tight sm:text-5xl">Know what is proven before you buy or finance a used EV.</h1>
            <p className="mt-5 text-lg text-white/75">VoltProof is evidence intelligence for used-EV transactions and financing risk. See what is verified, what is only claimed, and what is missing, in one report.</p>
            <div className="mt-8 max-w-md"><WaitlistForm /></div>
            <p className="mt-6 text-sm text-white/70">
              Buying, selling or financing EVs at volume? <a href="#demo" className="font-semibold text-[#7fd3b2] underline">Request a demo</a> or{" "}
              <Link href="/login" className="font-semibold text-[#7fd3b2] underline">see the live demo</Link>.
            </p>
          </div>
          <div>
            <div className="rounded-2xl bg-[#faf9f6] p-6 text-[#16202c] shadow-2xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-[#5b6672]">Evidence report</p>
                  <p className="text-lg font-semibold">2021 compact EV hatchback</p>
                  <p className="text-xs text-[#5b6672]">VIN ending 7K2P · 4 claims checked</p>
                </div>
                <span className="rounded-md border border-[#5b6672]/50 px-2 py-0.5 text-xs font-semibold text-[#5b6672]">Sample data</span>
              </div>
              <ul className="mt-4 divide-y divide-[#e6e2d8] border-y border-[#e6e2d8]">
                {SAMPLE.map((s) => (
                  <li key={s.label} className="py-3">
                    <div className="flex items-center justify-between gap-3 text-sm font-semibold">{s.label}<StatusBadge status={s.status} size="sm" /></div>
                    <p className="mt-0.5 text-xs text-[#5b6672]">{s.note}</p>
                  </li>
                ))}
              </ul>
              <p className="mt-4 rounded-lg bg-[#f3f1ec] px-4 py-3 text-sm"><strong>1 conflict to review</strong> before you pay. 2 claims backed by evidence, 1 still missing.</p>
            </div>
            <p className="mt-3 text-xs text-white/60">Illustrative sample. Every status in a real report links to its source. <Link href="/login" className="underline">See it live →</Link></p>
          </div>
        </div>
      </section>

      {/* Problem */}
      <section className={PAPER}>
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-3xl font-bold">Used-EV deals still run on claims.</h2>
          <p className="mt-3 max-w-2xl text-lg text-[#5b6672]">The battery is most of what you are paying for, and the hardest part to check. Almost everything else arrives as the seller's word.</p>
          <div className="mt-10 grid gap-8 md:grid-cols-3">
            {[
              ["Battery health is stated, not shown", "A percentage in a listing is not evidence. Where did it come from, and when was it measured?"],
              ["History has gaps", "Mileage, repairs and ownership sit in different places, and some never get recorded at all."],
              ["Uncertainty gets priced in", "When no one can tell what is true, buyers discount the car, lenders tighten terms, or the deal stalls."],
            ].map(([t, d]) => (
              <div key={t} className="border-t-2 border-[#16202c] pt-4">
                <h3 className="text-lg font-semibold">{t}</h3>
                <p className="mt-2 text-[#5b6672]">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className={`${PAPER} border-t border-[#e0ddd4]`}>
        <div className="mx-auto max-w-6xl px-6 py-20">
          <p className="text-sm font-semibold text-[#1f6b50]">How it works</p>
          <h2 className="mt-2 text-3xl font-bold">From the seller's word to evidence, in three steps.</h2>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {[
              ["Add the vehicle", "Enter the VIN and paste what the seller says. Gemini turns the listing into claims: battery health, mileage, accident history, charging."],
              ["We check each claim", "Gemini reads every document; a second OCR engine reads photos and handwriting again; forensic checks look for edits; tested rules compare every claim with the evidence."],
              ["Read the evidence", "Each claim comes back with a status and the page and quote behind it. An AI agent drafts the questions to ask and the issuers to confirm with."],
            ].map(([t, d], i) => (
              <div key={t} className="rounded-xl border border-[#e0ddd4] bg-[#faf9f6] p-6">
                <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[#0f1c2b] text-sm font-semibold text-[#7fd3b2]">{i + 1}</span>
                <h3 className="mt-4 font-semibold">{t}</h3>
                <p className="mt-2 text-sm text-[#5b6672]">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Statuses */}
      <section id="statuses" className={`${PAPER} border-t border-[#e0ddd4]`}>
        <div className="mx-auto max-w-6xl px-6 py-20">
          <p className="text-sm font-semibold text-[#1f6b50]">Evidence statuses</p>
          <h2 className="mt-2 text-3xl font-bold">Every claim gets one of four statuses.</h2>
          <p className="mt-3 max-w-2xl text-lg text-[#5b6672]">Each one is named in words and backed by a source, so nothing is left to interpretation. Statuses come from tested rules, never from the AI model.</p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STATUS_TEXT.map(([s, d]) => (
              <div key={s} className="rounded-xl border border-[#e0ddd4] bg-[#faf9f6] p-5">
                <StatusBadge status={s} />
                <p className="mt-3 text-sm text-[#5b6672]">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Who */}
      <section id="who" className={`${PAPER} border-t border-[#e0ddd4]`}>
        <div className="mx-auto max-w-6xl px-6 py-20">
          <p className="text-sm font-semibold text-[#1f6b50]">Who it's for</p>
          <h2 className="mt-2 text-3xl font-bold">Built for the people who carry the risk.</h2>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {[
              ["Lenders and lessors", "Underwrite used EVs on evidence. See which claims hold before you set terms."],
              ["Dealers and marketplaces", "Show buyers what is proven, and catch conflicts and edited paperwork before a car goes on sale."],
              ["Buyers and fleet managers", "Know what you are paying for before you sign, and what to ask when something is missing."],
            ].map(([t, d]) => (
              <div key={t} className="rounded-xl border border-[#e0ddd4] bg-[#faf9f6] p-6">
                <h3 className="font-semibold">{t}</h3>
                <p className="mt-2 text-sm text-[#5b6672]">{d}</p>
              </div>
            ))}
          </div>
          <p className="mt-8"><a href="#demo" className="font-semibold text-[#1f6b50] underline">Request a demo for your team →</a></p>
        </div>
      </section>

      {/* Demo */}
      <section id="demo" className={`${PAPER} border-t border-[#e0ddd4]`}>
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-20 lg:grid-cols-[1fr_1.1fr]">
          <div>
            <p className="text-sm font-semibold text-[#1f6b50]">Request a demo</p>
            <h2 className="mt-2 text-3xl font-bold">See an evidence report built around your work.</h2>
            <p className="mt-3 text-lg text-[#5b6672]">Tell us a little about your team. We'll walk you through a sample report and talk about the vehicles and decisions you handle.</p>
            <ul className="mt-6 grid gap-2 text-sm">
              {["A short call with the founding team", "A walk-through of a sample evidence report", "Early access when it fits your use case"].map((x) => (
                <li key={x} className="flex items-center gap-2"><span className="h-2 w-2 rounded-sm bg-[#1f6b50]" />{x}</li>
              ))}
            </ul>
            <p className="mt-6 text-sm text-[#5b6672]">Want to see it now? <Link href="/login" className="font-semibold text-[#1f6b50] underline">Open the live demo</Link> (access code from the team).</p>
          </div>
          <div className="rounded-xl border border-[#e0ddd4] bg-[#faf9f6] p-6">
            <h3 className="mb-1 font-semibold">Book your demo</h3>
            <p className="mb-4 text-xs text-[#5b6672]">All fields are required unless marked optional.</p>
            <DemoRequestForm />
          </div>
        </div>
      </section>

      {/* Team */}
      <section id="team" className={`${PAPER} border-t border-[#e0ddd4]`}>
        <div className="mx-auto max-w-6xl px-6 py-20">
          <p className="text-sm font-semibold text-[#1f6b50]">Team</p>
          <h2 className="mt-2 text-3xl font-bold">The people behind VoltProof.</h2>
          <p className="mt-3 max-w-2xl text-lg text-[#5b6672]">Engineering validation and AI on real-world device data: the two skills it takes to turn claims about a vehicle into evidence.</p>
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            {[
              ["LE", "Loubna Enakhli", "Founding team · Modeling, strategy and partnerships · Seoul, South Korea", "Simulation engineer (MEng, MSc) with experience in predictive modeling, product validation and data analysis across automotive, industrial and consumer goods. At VoltProof, she brings engineering discipline to how evidence is weighed, and leads partnerships with lenders, dealers and marketplaces."],
              ["MH", "Muhammad Rizky Hatsa", "Founding team · AI, data and embedded systems · Indonesia", "Machine learning and AIoT engineer and CUDA/OpenCL programmer. He has deployed AI models on embedded boards and integrated ML models into production backends. At VoltProof, he builds the models and data pipelines that read device records and turn them into a clear status for each claim."],
            ].map(([i, n, r, b]) => (
              <div key={n} className="rounded-xl border border-[#e0ddd4] bg-[#faf9f6] p-6">
                <div className="flex items-center gap-4">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#0f1c2b] font-semibold text-[#7fd3b2]">{i}</span>
                  <div>
                    <p className="font-semibold">{n}</p>
                    <p className="text-xs text-[#5b6672]">{r}</p>
                  </div>
                </div>
                <p className="mt-4 text-sm text-[#5b6672]">{b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className={`${PAPER} border-t border-[#e0ddd4]`}>
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-20 lg:grid-cols-[1fr_1.6fr]">
          <div>
            <p className="text-sm font-semibold text-[#1f6b50]">FAQ</p>
            <h2 className="mt-2 text-3xl font-bold">Questions, answered plainly.</h2>
            <p className="mt-3 text-[#5b6672]">Something else on your mind? <a href="#demo" className="text-[#1f6b50] underline">Ask us in the demo form.</a></p>
          </div>
          <div className="divide-y divide-[#e0ddd4] border-y border-[#e0ddd4]">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between font-semibold">
                  {q}
                  <span className="text-xl text-[#5b6672] group-open:rotate-45">+</span>
                </summary>
                <p className="mt-2 text-sm text-[#5b6672]">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA + footer */}
      <footer className={`${NAVY} text-white`}>
        <div className="mx-auto grid max-w-6xl gap-10 border-b border-white/10 px-6 py-16 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-bold">Be among the first to use VoltProof.</h2>
            <p className="mt-3 text-white/70">Join the waitlist and we'll let you know the moment your early access is ready.</p>
          </div>
          <WaitlistForm />
        </div>
        <div className="mx-auto flex max-w-6xl flex-wrap items-start justify-between gap-6 px-6 py-10 text-sm text-white/70">
          <div>
            <Logo />
            <p className="mt-2 max-w-xs">Evidence intelligence for used-EV transactions and financing risk.</p>
          </div>
          <div className="flex gap-12">
            <div className="grid gap-2">
              <span className="font-semibold text-white">Product</span>
              <a href="#how">How it works</a>
              <a href="#statuses">Evidence statuses</a>
              <Link href="/login">Live demo</Link>
            </div>
            <div className="grid gap-2">
              <span className="font-semibold text-white">Company</span>
              <a href="#team">Team</a>
              <a href="#faq">FAQ</a>
              <a href="https://github.com/looubna/voltproof">GitHub</a>
            </div>
          </div>
        </div>
        <p className="mx-auto max-w-6xl px-6 pb-8 text-xs text-white/50">© 2026 VoltProof. Built on Google Cloud: Gemini on Vertex AI, an ADK agent and Cloud Run.</p>
      </footer>
    </div>
  );
}
