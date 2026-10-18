// Picks a supported language from an Accept-Language header. Pure, so it runs in the
// edge middleware as well as on the server.
import { LOCALES, type Locale } from "./config";

/**
 * "ko-KR,ko;q=0.9,en-US;q=0.8" → "ko". Ranges are tried by quality, then by order;
 * a regional tag matches its base language ("id-ID" → "id"). Null when nothing matches.
 */
export function negotiateLocale(acceptLanguage: string | null | undefined): Locale | null {
  if (!acceptLanguage) return null;
  const ranges = acceptLanguage
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const quality = q ? Number(q.slice(2)) : 1;
      return { tag: tag.trim().toLowerCase(), quality: Number.isFinite(quality) ? quality : 0, index };
    })
    .filter((r) => r.tag && r.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index);
  for (const { tag } of ranges) {
    if (tag === "*") return null;
    const base = tag.split("-")[0];
    const match = LOCALES.find((l) => l === tag || l === base);
    if (match) return match;
  }
  return null;
}
