// Server-side language resolution and messages. Server components only (reads request headers).
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { DEFAULT_LOCALE, INTL_LOCALE, LOCALES, LOCALE_COOKIE, PATH_LOCALE_HEADER, isLocale, landingPath, type Locale } from "./config";
import { MESSAGES } from "./messages/catalog";
import type { Messages } from "./messages/en";
import { negotiateLocale } from "./negotiate";

export function getMessages(locale: Locale): Messages {
  return MESSAGES[locale];
}

/**
 * The language for this request: the landing page's URL language (set by the middleware),
 * else the language the person chose, else their browser's preference, else English.
 * Cached per request, so the layout and the page agree.
 */
export const getLocale = cache(async (): Promise<Locale> => {
  const h = await headers();
  const fromPath = h.get(PATH_LOCALE_HEADER);
  if (isLocale(fromPath)) return fromPath;
  const saved = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(saved)) return saved;
  return negotiateLocale(h.get("accept-language")) ?? DEFAULT_LOCALE;
});

/** The request's language and its messages. */
export async function getI18n() {
  const locale = await getLocale();
  return { locale, m: MESSAGES[locale] };
}

/** This deployment's origin, so canonical and hreflang URLs are absolute, as search engines require. */
async function requestOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return undefined;
  const proto = h.get("x-forwarded-proto")?.split(",")[0] ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  try {
    return new URL(`${proto}://${host}`);
  } catch {
    return undefined;
  }
}

/** Title, description and the links between the landing page's language versions. */
export async function landingMetadata(locale: Locale): Promise<Metadata> {
  const { meta } = MESSAGES[locale];
  const languages = Object.fromEntries([...LOCALES.map((l) => [l, landingPath(l)]), ["x-default", landingPath(DEFAULT_LOCALE)]]);
  const ogLocale = (l: Locale) => INTL_LOCALE[l].replace("-", "_");
  return {
    metadataBase: await requestOrigin(),
    title: meta.landingTitle,
    description: meta.landingDescription,
    alternates: { canonical: landingPath(locale), languages },
    openGraph: {
      type: "website",
      siteName: "VoltProof",
      title: meta.landingTitle,
      description: meta.landingDescription,
      url: landingPath(locale),
      locale: ogLocale(locale),
      alternateLocale: LOCALES.filter((l) => l !== locale).map(ogLocale),
    },
  };
}
