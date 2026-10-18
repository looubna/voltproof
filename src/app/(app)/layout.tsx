// App shell: header and container for every signed-in page (and the sign-in page).
import Link from "next/link";
import { cookies } from "next/headers";
import { AppNav } from "@/components/app-nav";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Logo } from "@/components/logo";
import { landingPath } from "@/i18n/config";
import type { Messages } from "@/i18n/messages/en";
import { getI18n } from "@/i18n/server";
import { currentUser } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { TECHNICAL_COOKIE } from "@/lib/preferences";

/** Whether documents are read by AI right now, in plain words; the model name is a technical detail. */
function AiModePill({ copy }: { copy: Messages["nav"] }) {
  const cfg = getConfig();
  if (cfg.aiMode === "vertex") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-2.5 py-1 text-xs font-medium text-emerald-200">
        {copy.aiLive}
        <span className="tech-detail font-normal text-emerald-200/80">· {cfg.geminiModel}</span>
      </span>
    );
  }
  return <span className="inline-flex rounded-full bg-amber-300/15 px-2.5 py-1 text-xs font-medium text-amber-200">{copy.aiDemo}</span>;
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  const technical = (await cookies()).get(TECHNICAL_COOKIE)?.value === "on";
  const { locale, m } = await getI18n();
  return (
    <>
      {user && (
        <header className="no-print relative bg-navy-950 text-white">
          <div className="mx-auto flex max-w-6xl items-center gap-x-6 px-4 py-2.5 sm:px-6">
            <Link href="/dashboard" aria-label={m.nav.home} className="flex shrink-0 items-center rounded-md py-0.5">
              <Logo height={28} priority />
            </Link>
            <AppNav
              user={user}
              technical={technical}
              aiMode={<AiModePill copy={m.nav} />}
              copy={m.nav}
              homeHref={landingPath(locale)}
              languageMenu={<LanguageSwitcher current={locale} label={m.language.label} />}
              languageList={<LanguageSwitcher current={locale} label={m.language.label} variant="list" />}
            />
          </div>
        </header>
      )}
      {/* Every page is in the chosen language (<html lang>). Text kept as written, such as the AI's drafts
          or a check's own English message, is marked with its own lang where it appears. */}
      <main id="main" className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {children}
      </main>
    </>
  );
}
