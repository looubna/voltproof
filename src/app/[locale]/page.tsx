// The landing page in a language other than English: /id, /ko.
// Any other single-segment path that reaches this route is not a page.
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { LandingPage } from "@/components/landing-page";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";
import { landingMetadata } from "@/i18n/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? landingMetadata(locale) : {};
}

export default async function LocalizedLanding({ params }: Params) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  // English lives at "/" (the middleware normally redirects /en before it gets here).
  if (locale === DEFAULT_LOCALE) redirect("/");
  return <LandingPage locale={locale} />;
}
