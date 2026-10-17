// Languages VoltProof is offered in. Safe for server, client and middleware (edge) code.

export const LOCALES = ["en", "id", "ko"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

/** Each language named in itself, so people can find theirs whatever the page language is. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  id: "Bahasa Indonesia",
  ko: "한국어",
};

/** BCP 47 tags for Intl date, number and plural formatting. */
export const INTL_LOCALE: Record<Locale, string> = {
  en: "en-GB",
  id: "id-ID",
  ko: "ko-KR",
};

/** The language a person chose, remembered for the app (pages whose URL has no language). */
export const LOCALE_COOKIE = "NEXT_LOCALE";

/** A functional preference: a year, first-party, not readable by page scripts. */
export const LOCALE_COOKIE_OPTIONS = {
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
  sameSite: "lax",
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
} as const;

/** Set by the middleware on landing page requests: the language in the URL, which wins over the cookie. */
export const PATH_LOCALE_HEADER = "x-vp-path-locale";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * The public landing page has one URL per language: "/" (English), "/id", "/ko".
 * Search engines index each one, and links can be shared in a given language.
 */
export function landingPath(locale: Locale): string {
  return locale === DEFAULT_LOCALE ? "/" : `/${locale}`;
}

/**
 * Where the language switcher links to on the landing page. English goes through
 * "/en", which records the choice and redirects to "/" (see src/middleware.ts);
 * a plain link to "/" would send someone who chose Korean before back to "/ko".
 */
export function switchLandingPath(locale: Locale): string {
  return locale === DEFAULT_LOCALE ? `/${DEFAULT_LOCALE}` : `/${locale}`;
}
