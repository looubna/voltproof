import { cookies } from "next/headers";
import Link from "next/link";
import { TechnicalToggle } from "@/components/technical-toggle";
import { PageTitle, StatusLegend } from "@/components/ui";
import { format, formatPlural } from "@/i18n/format";
import { rich } from "@/i18n/rich";
import { RULE_TEXT } from "@/i18n/rules";
import { getI18n } from "@/i18n/server";
import { agentConfigured } from "@/lib/agent";
import { requireUser } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { ocrConfigured } from "@/lib/ocr/paddle";
import { TECHNICAL_COOKIE } from "@/lib/preferences";
import { CAR365_NAME, car365Status } from "@/lib/registry/car365";
import { ruleCheckTitles } from "@/lib/rules";
import { SAMPLE_CASES } from "@/lib/samples/definitions";

export const dynamic = "force-dynamic";

const STEPS = ["upload", "read", "decide", "resolve", "report"] as const;
const GLOSSARY = ["vin", "registration", "odometer", "soh", "batteryReport", "dc", "claim", "source", "issuer", "confirmed", "signature", "edit", "decision", "agent", "technical"] as const;

export default async function AboutPage() {
  await requireUser();
  const { locale, m } = await getI18n();
  const t = m.about;
  const cfg = getConfig();
  const technical = (await cookies()).get(TECHNICAL_COOKIE)?.value === "on";
  // The checks' own titles, from the rules in the reader's language, so this list cannot drift from them.
  const checks = ruleCheckTitles(RULE_TEXT[locale]);
  const car365 = car365Status(process.env.KR_CAR365_SERVICE_KEY);
  const samples = SAMPLE_CASES.map((s) => `${s.vehicle.make} ${s.vehicle.model}`);
  const provenance = { seller: m.labels.provenance.seller_provided, captured: m.labels.provenance.dealer_captured, ordered: m.labels.provenance.dealer_ordered };
  return (
    <>
      <PageTitle eyebrow={t.eyebrow} title={t.title}>
        {t.intro}
      </PageTitle>
      <ol className="mb-8 grid gap-3 md:grid-cols-5">
        {STEPS.map((key) => (
          <li key={key} className="card p-4">
            <div className="text-sm font-semibold">{t.steps[key].title}</div>
            <p className="mt-1 text-sm leading-relaxed text-muted">{t.steps[key].body}</p>
          </li>
        ))}
      </ol>

      <h2 id="statuses" className="mb-3 scroll-mt-6 text-lg font-semibold">
        {t.statuses}
      </h2>
      <div className="mb-8">
        <StatusLegend />
      </div>

      <section aria-labelledby="glossary" className="card mb-8 p-5">
        <h2 id="glossary" className="scroll-mt-6 text-lg font-semibold">
          {t.glossary.title}
        </h2>
        <dl className="mt-3 grid gap-x-8 gap-y-3 text-sm md:grid-cols-2">
          {GLOSSARY.map((key) => (
            <div key={key}>
              <dt className="font-semibold text-ink">{t.glossary.items[key].term}</dt>
              <dd className="mt-0.5 text-muted">{key === "source" ? format(t.glossary.items.source.meaning, provenance) : t.glossary.items[key].meaning}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="grid gap-6 md:grid-cols-3">
        <section className="card p-5 text-sm">
          <h2 className="mb-2 font-semibold">{t.today.title}</h2>
          <ul className="grid list-disc gap-1 pl-5">
            <li>{t.today.cases}</li>
            <li>{rich(formatPlural(locale, t.today.checks, checks.length), { list: <span className="tech-detail"> ({checks.join(", ")})</span> })}</li>
            <li>{t.today.claims}</li>
            <li>{t.today.review}</li>
            <li>{t.today.lookups}</li>
            <li>{t.today.issuers}</li>
            <li>
              {rich(t.today.reading, { state: <strong>{cfg.aiMode === "vertex" ? t.today.on : t.today.offDemo}</strong> })}
              <span className="tech-detail">
                {" "}
                (
                {cfg.aiMode === "vertex"
                  ? format(t.today.vertexModel, { model: cfg.geminiModel }) + (cfg.geminiFallbackModel ? format(t.today.fallback, { model: cfg.geminiFallbackModel }) : "")
                  : t.today.noModel}
                )
              </span>
            </li>
            <li>
              {format(t.today.ocr, { state: ocrConfigured() ? t.today.on : t.today.off })}
              <span className="tech-detail">{t.today.paddle}</span>
            </li>
            <li>
              {format(t.today.agent, { state: agentConfigured() ? t.today.available : t.today.notAvailable })}
              <span className="tech-detail">{t.today.adk}</span>
            </li>
            <li className="tech-detail">{format(t.today.storage, { storage: cfg.storage === "gcp" ? t.today.gcp : t.today.local })}</li>
          </ul>
          <TechnicalToggle initial={technical} className="mt-3" label={m.nav.technicalDetails} />
        </section>
        <section className="card p-5 text-sm">
          <h2 className="mb-2 font-semibold">{t.demo.title}</h2>
          <ul className="grid list-disc gap-1 pl-5">
            <li>
              {formatPlural(locale, t.demo.cases, samples.length, { list: samples.join(", ") })}{" "}
              <Link href="/dashboard" className="link">
                {t.demo.open}
              </Link>
            </li>
            <li>{t.demo.fixtures}</li>
            <li>{t.demo.noReal}</li>
          </ul>
        </section>
        <section className="card p-5 text-sm">
          <h2 className="mb-2 font-semibold">{t.notYet.title}</h2>
          <ul className="grid list-disc gap-1 pl-5">
            <li>
              {format(t.notYet.car365, { name: CAR365_NAME })}
              {car365.configured ? t.notYet.car365Key : ""}
            </li>
            <li>{t.notYet.nz}</li>
            <li>{t.notYet.issuers}</li>
            <li>{t.notYet.library}</li>
            <li>{t.notYet.forgery}</li>
            <li>{t.notYet.privacy}</li>
            <li>{t.notYet.lenders}</li>
          </ul>
        </section>
      </div>

      <section className="card mt-6 p-5 text-sm">
        <h2 className="mb-2 font-semibold">{t.who.title}</h2>
        <p>
          <strong>{t.who.now}</strong> {t.who.nowBody}
        </p>
        <p className="mt-1">
          <strong>{t.who.later}</strong> {t.who.laterBody}
        </p>
      </section>
    </>
  );
}
