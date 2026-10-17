// Per-browser display preferences, kept in cookies so the server renders the
// right state on the first paint (no flash). Not secrets; safe for client code.

/** "on" shows model names, version numbers, hashes and scores (elements with the `tech-detail` class). */
export const TECHNICAL_COOKIE = "vp_technical";

/** "hidden" once the dashboard's getting-started guide has been dismissed. */
export const WELCOME_COOKIE = "vp_welcome";

/** Sets a preference cookie for a year. Browser only. */
export function setPreferenceCookie(name: string, value: string) {
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${name}=${value}; path=/; max-age=31536000; samesite=lax${secure}`;
}
