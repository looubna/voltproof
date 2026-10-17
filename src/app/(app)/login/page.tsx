import Link from "next/link";
import { Suspense } from "react";
import { LoginForm } from "@/components/client";
import { LanguageSwitcher } from "@/components/language-switcher";
import { LogoMark } from "@/components/logo";
import { landingPath } from "@/i18n/config";
import { rich } from "@/i18n/rich";
import { getI18n } from "@/i18n/server";
import { getConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const { accessCode } = getConfig();
  const { locale, m } = await getI18n();
  const t = m.login;
  return (
    // Translated, unlike most app pages (see the lang note in the app layout).
    <div lang={locale} className="mx-auto mt-2 max-w-md">
      <div className="mb-6 flex items-center justify-between gap-3">
        <Link href={landingPath(locale)} className="link inline-flex min-h-11 items-center gap-1 text-sm">
          <span aria-hidden>←</span> {t.home}
        </Link>
        <LanguageSwitcher current={locale} label={m.language.label} tone="light" />
      </div>
      <div className="mb-6 text-center">
        {/* Light page, so the mark alone; the heading below carries the name. */}
        <LogoMark size={48} priority className="mx-auto mb-3" />
        <h1 className="text-2xl font-semibold tracking-tight">VoltProof</h1>
        <p className="mt-1 text-sm text-muted">{t.tagline}</p>
      </div>
      <div className="card p-6">
        <Suspense>
          <LoginForm needsCode={!!accessCode} copy={t} />
        </Suspense>
        {!accessCode && <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{rich(t.openAccess, { setting: <code>VOLTPROOF_ACCESS_CODE</code> })}</p>}
      </div>
      <p className="mt-4 text-center text-xs text-muted">{t.motto}</p>
    </div>
  );
}
