// Public landing page (from the VoltProof landing page design), rendered once per language:
// "/" (English), "/id" and "/ko". The waitlist and demo forms post to /api/leads;
// "See the live demo" opens the signed-in app.
import Link from "next/link";
import { DemoRequestForm, WaitlistForm } from "@/components/client";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Logo, LogoMark } from "@/components/logo";
import { StatusBadge } from "@/components/ui";
import { LOCALES, switchLandingPath, type Locale } from "@/i18n/config";
import { rich } from "@/i18n/rich";
import { getMessages } from "@/i18n/server";
import type { Status } from "@/lib/types";

const NAVY = "bg-[#0f1c2b]";
const PAPER = "bg-[#f3f1ec]";
const STATUSES: Status[] = ["verified", "consistent", "conflict", "unknown"];
const SAMPLE_STATUS = { battery: "verified", mileage: "consistent", accident: "conflict", charging: "unknown" } as const;
const TEAM = [
  { key: "loubna", initials: "LE", name: "Loubna Enakhli" },
  { key: "rizky", initials: "MH", name: "Muhammad Rizky Hatsa" },
] as const;

export function LandingPage({ locale }: { locale: Locale }) {
  const m = getMessages(locale);
  const t = m.landing;
  const badge = (s: Status, size?: "sm") => <StatusBadge status={s} size={size} label={m.status[s]} meaning={m.statusMeaning[s]} />;
  const switcherHrefs = Object.fromEntries(LOCALES.map((l) => [l, switchLandingPath(l)])) as Record<Locale, string>;

  return (
    <div className="text-[#16202c]">
      <a href="#main" className="sr-only z-50 rounded-lg bg-[#7fd3b2] px-4 py-3 font-semibold text-[#0f1c2b] focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        {t.skip}
      </a>

      <header className={`${NAVY} text-white`}>
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Logo height={32} priority className="h-7 w-auto sm:h-8" />
          <nav aria-label={t.nav.label} className="hidden gap-6 text-sm text-white/75 lg:flex">
            <a href="#how" className="hover:text-white">{t.nav.how}</a>
            <a href="#statuses" className="hover:text-white">{t.nav.statuses}</a>
            <a href="#who" className="hover:text-white">{t.nav.who}</a>
            <a href="#team" className="hover:text-white">{t.nav.team}</a>
            <a href="#faq" className="hover:text-white">{t.nav.faq}</a>
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            <LanguageSwitcher current={locale} label={m.language.label} hrefs={switcherHrefs} />
            <Link href="/login" className="hidden text-sm text-white/80 hover:text-white sm:block">
              {t.nav.signIn}
            </Link>
            <a href="#demo" className="whitespace-nowrap rounded-lg bg-[#7fd3b2] px-3 py-2 text-sm font-semibold text-[#0f1c2b] hover:bg-[#95ddc0] sm:px-4">
              {t.nav.requestDemo}
            </a>
          </div>
        </div>
      </header>

      <main id="main">
        {/* Hero */}
        <section className={`${NAVY} text-white`}>
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-20 pt-10 lg:grid-cols-2">
            <div>
              <p className="mb-4 flex items-center gap-2 text-sm font-semibold text-[#7fd3b2]">
                <span className="h-2 w-2 rounded-sm bg-[#7fd3b2]" />
                {t.hero.badge}
              </p>
              <h1 className="text-4xl font-bold leading-tight sm:text-5xl">{t.hero.title}</h1>
              <p className="mt-5 text-lg text-white/75">{t.hero.body}</p>
              <div className="mt-8 max-w-md">
                <WaitlistForm copy={t.waitlist} errors={t.errors} />
              </div>
              <p className="mt-6 text-sm text-white/70">
                {rich(t.hero.volume, {
                  demo: (
                    <a href="#demo" className="font-semibold text-[#7fd3b2] underline">
                      {t.hero.volumeDemo}
                    </a>
                  ),
                  live: (
                    <Link href="/login" className="font-semibold text-[#7fd3b2] underline">
                      {t.hero.volumeLive}
                    </Link>
                  ),
                })}
              </p>
            </div>
            <div>
              <div className="rounded-2xl bg-[#faf9f6] p-6 text-[#16202c] shadow-2xl">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-[#5b6672]">{t.sample.eyebrow}</p>
                    <p className="text-lg font-semibold">{t.sample.vehicle}</p>
                    <p className="text-xs text-[#5b6672]">{t.sample.meta}</p>
                  </div>
                  <span className="rounded-md border border-[#5b6672]/50 px-2 py-0.5 text-xs font-semibold text-[#5b6672]">{t.sample.badge}</span>
                </div>
                <ul className="mt-4 divide-y divide-[#e6e2d8] border-y border-[#e6e2d8]">
                  {(Object.keys(SAMPLE_STATUS) as (keyof typeof SAMPLE_STATUS)[]).map((k) => (
                    <li key={k} className="py-3">
                      <div className="flex items-center justify-between gap-3 text-sm font-semibold">
                        {t.sample.claims[k].label}
                        {badge(SAMPLE_STATUS[k], "sm")}
                      </div>
                      <p className="mt-0.5 text-xs text-[#5b6672]">{t.sample.claims[k].note}</p>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 rounded-lg bg-[#f3f1ec] px-4 py-3 text-sm">{rich(t.sample.summary, { strong: <strong>{t.sample.summaryStrong}</strong> })}</p>
              </div>
              <p className="mt-3 text-xs text-white/60">
                {rich(t.sample.caption, {
                  link: (
                    <Link href="/login" className="underline">
                      {t.sample.captionLink}
                    </Link>
                  ),
                })}
              </p>
            </div>
          </div>
        </section>

        {/* Problem */}
        <section className={PAPER}>
          <div className="mx-auto max-w-6xl px-6 py-20">
            <h2 className="text-3xl font-bold">{t.problem.title}</h2>
            <p className="mt-3 max-w-2xl text-lg text-[#5b6672]">{t.problem.body}</p>
            <div className="mt-10 grid gap-8 md:grid-cols-3">
              {Object.values(t.problem.points).map((p) => (
                <div key={p.title} className="border-t-2 border-[#16202c] pt-4">
                  <h3 className="text-lg font-semibold">{p.title}</h3>
                  <p className="mt-2 text-[#5b6672]">{p.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className={`${PAPER} scroll-mt-4 border-t border-[#e0ddd4]`}>
          <div className="mx-auto max-w-6xl px-6 py-20">
            <p className="text-sm font-semibold text-[#1f6b50]">{t.how.eyebrow}</p>
            <h2 className="mt-2 text-3xl font-bold">{t.how.title}</h2>
            <ol className="mt-10 grid gap-5 md:grid-cols-3">
              {Object.values(t.how.steps).map((s, i) => (
                <li key={s.title} className="rounded-xl border border-[#e0ddd4] bg-[#faf9f6] p-6">
                  <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-md bg-[#0f1c2b] text-sm font-semibold text-[#7fd3b2]">
                    {i + 1}
                  </span>
                  <h3 className="mt-4 font-semibold">{s.title}</h3>
                  <p className="mt-2 text-sm text-[#5b6672]">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Statuses */}
        <section id="statuses" className={`${PAPER} scroll-mt-4 border-t border-[#e0ddd4]`}>
          <div className="mx-auto max-w-6xl px-6 py-20">
            <p className="text-sm font-semibold text-[#1f6b50]">{t.statuses.eyebrow}</p>
            <h2 className="mt-2 text-3xl font-bold">{t.statuses.title}</h2>
            <p className="mt-3 max-w-2xl text-lg text-[#5b6672]">{t.statuses.body}</p>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {STATUSES.map((s) => (
                <div key={s} className="rounded-xl border border-[#e0ddd4] bg-[#faf9f6] p-5">
                  {badge(s)}
                  <p className="mt-3 text-sm text-[#5b6672]">{t.statuses[s]}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Who */}
        <section id="who" className={`${PAPER} scroll-mt-4 border-t border-[#e0ddd4]`}>
          <div className="mx-auto max-w-6xl px-6 py-20">
            <p className="text-sm font-semibold text-[#1f6b50]">{t.who.eyebrow}</p>
            <h2 className="mt-2 text-3xl font-bold">{t.who.title}</h2>
            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {Object.values(t.who.groups).map((g) => (
                <div key={g.title} className="rounded-xl border border-[#e0ddd4] bg-[#faf9f6] p-6">
                  <h3 className="font-semibold">{g.title}</h3>
                  <p className="mt-2 text-sm text-[#5b6672]">{g.body}</p>
                </div>
              ))}
            </div>
            <p className="mt-8">
              <a href="#demo" className="font-semibold text-[#1f6b50] underline">
                {t.who.cta}
              </a>
            </p>
          </div>
        </section>

        {/* Demo */}
        <section id="demo" className={`${PAPER} scroll-mt-4 border-t border-[#e0ddd4]`}>
          <div className="mx-auto grid max-w-6xl gap-10 px-6 py-20 lg:grid-cols-[1fr_1.1fr]">
            <div>
              <p className="text-sm font-semibold text-[#1f6b50]">{t.demo.eyebrow}</p>
              <h2 className="mt-2 text-3xl font-bold">{t.demo.title}</h2>
              <p className="mt-3 text-lg text-[#5b6672]">{t.demo.body}</p>
              <ul className="mt-6 grid gap-2 text-sm">
                {Object.values(t.demo.points).map((x) => (
                  <li key={x} className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-sm bg-[#1f6b50]" />
                    {x}
                  </li>
                ))}
              </ul>
              <p className="mt-6 text-sm text-[#5b6672]">
                {rich(t.demo.live, {
                  link: (
                    <Link href="/login" className="font-semibold text-[#1f6b50] underline">
                      {t.demo.liveLink}
                    </Link>
                  ),
                })}
              </p>
            </div>
            <div className="rounded-xl border border-[#e0ddd4] bg-[#faf9f6] p-6">
              <h3 className="mb-1 font-semibold">{t.demo.formTitle}</h3>
              <p className="mb-4 text-xs text-[#5b6672]">{t.demo.formNote}</p>
              <DemoRequestForm copy={t.demoForm} errors={t.errors} />
            </div>
          </div>
        </section>

        {/* Team */}
        <section id="team" className={`${PAPER} scroll-mt-4 border-t border-[#e0ddd4]`}>
          <div className="mx-auto max-w-6xl px-6 py-20">
            <p className="text-sm font-semibold text-[#1f6b50]">{t.team.eyebrow}</p>
            <h2 className="mt-2 text-3xl font-bold">{t.team.title}</h2>
            <p className="mt-3 max-w-2xl text-lg text-[#5b6672]">{t.team.body}</p>
            <div className="mt-10 grid gap-5 md:grid-cols-2">
              {TEAM.map((p) => (
                <div key={p.key} className="rounded-xl border border-[#e0ddd4] bg-[#faf9f6] p-6">
                  <div className="flex items-center gap-4">
                    <span aria-hidden className="flex h-12 w-12 items-center justify-center rounded-full bg-[#0f1c2b] font-semibold text-[#7fd3b2]">
                      {p.initials}
                    </span>
                    <div>
                      <p className="font-semibold">{p.name}</p>
                      <p className="text-xs text-[#5b6672]">{t.team[p.key].role}</p>
                    </div>
                  </div>
                  <p className="mt-4 text-sm text-[#5b6672]">{t.team[p.key].bio}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className={`${PAPER} scroll-mt-4 border-t border-[#e0ddd4]`}>
          <div className="mx-auto grid max-w-6xl gap-10 px-6 py-20 lg:grid-cols-[1fr_1.6fr]">
            <div>
              <p className="text-sm font-semibold text-[#1f6b50]">{t.faq.eyebrow}</p>
              <h2 className="mt-2 text-3xl font-bold">{t.faq.title}</h2>
              <p className="mt-3 text-[#5b6672]">
                {rich(t.faq.body, {
                  link: (
                    <a href="#demo" className="text-[#1f6b50] underline">
                      {t.faq.bodyLink}
                    </a>
                  ),
                })}
              </p>
            </div>
            <div className="divide-y divide-[#e0ddd4] border-y border-[#e0ddd4]">
              {Object.values(t.faq.items).map(({ q, a }) => (
                <details key={q} className="group py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold [&::-webkit-details-marker]:hidden">
                    {q}
                    <span aria-hidden className="text-xl text-[#5b6672] group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="mt-2 text-sm text-[#5b6672]">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* CTA + footer */}
      <footer className={`${NAVY} text-white`}>
        <div className="mx-auto grid max-w-6xl gap-10 border-b border-white/10 px-6 py-16 lg:grid-cols-2">
          <div>
            <LogoMark size={56} className="mb-4" />
            <h2 className="text-3xl font-bold">{t.cta.title}</h2>
            <p className="mt-3 text-white/70">{t.cta.body}</p>
          </div>
          <WaitlistForm copy={t.waitlist} errors={t.errors} />
        </div>
        <div className="mx-auto flex max-w-6xl flex-wrap items-start justify-between gap-6 px-6 py-10 text-sm text-white/70">
          <div>
            <Logo height={30} />
            <p className="mt-3 max-w-xs">{t.footer.tagline}</p>
          </div>
          <div className="flex gap-12">
            <div className="grid gap-2">
              <span className="font-semibold text-white">{t.footer.product}</span>
              <a href="#how">{t.nav.how}</a>
              <a href="#statuses">{t.nav.statuses}</a>
              <Link href="/login">{t.footer.liveDemo}</Link>
            </div>
            <div className="grid gap-2">
              <span className="font-semibold text-white">{t.footer.company}</span>
              <a href="#team">{t.nav.team}</a>
              <a href="#faq">{t.nav.faq}</a>
              <a href="https://github.com/looubna/voltproof">GitHub</a>
            </div>
          </div>
        </div>
        <p className="mx-auto max-w-6xl px-6 pb-8 text-xs text-white/50">{t.footer.copyright}</p>
      </footer>
    </div>
  );
}
