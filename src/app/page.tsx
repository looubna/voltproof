// The English landing page. Other languages live at /id and /ko (src/app/[locale]/page.tsx);
// the middleware sends returning visitors and first-time visitors to their language.
import type { Metadata } from "next";
import { LandingPage } from "@/components/landing-page";
import { DEFAULT_LOCALE } from "@/i18n/config";
import { landingMetadata } from "@/i18n/server";

// Rendered per request so its inline scripts carry the Content-Security-Policy nonce (see src/middleware.ts).
export const dynamic = "force-dynamic";

export function generateMetadata(): Promise<Metadata> {
  return landingMetadata(DEFAULT_LOCALE);
}

export default function Landing() {
  return <LandingPage locale={DEFAULT_LOCALE} />;
}
