"use client";

// The page's language for client components: dates and numbers in its conventions, and the
// few messages client components outside any page need (the error page). Pages pass their
// client components only the messages those use, as props, rather than the whole catalog.
import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_LOCALE, type Locale } from "./config";
import type { Messages } from "./messages/en";

interface ClientI18n {
  locale: Locale;
  errorPage: Messages["errorPage"];
}

// The root layout always provides the real values; this default only keeps the type simple
// (importing a catalog here would ship it to every browser).
const I18nContext = createContext<ClientI18n>({ locale: DEFAULT_LOCALE, errorPage: { title: "", retry: "" } });

export function I18nProvider({ locale, errorPage, children }: ClientI18n & { children: ReactNode }) {
  return <I18nContext.Provider value={{ locale, errorPage }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
