"use server";

import { cookies } from "next/headers";
import { LOCALE_COOKIE, LOCALE_COOKIE_OPTIONS, isLocale } from "./config";

/**
 * Saves the language chosen in the app's language switcher. Setting a cookie in a
 * Server Action makes Next.js re-render the current page, now in that language.
 * A plain form post, so it also works before JavaScript has loaded.
 */
export async function setLocale(formData: FormData) {
  const locale = formData.get("locale");
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, LOCALE_COOKIE_OPTIONS);
}
