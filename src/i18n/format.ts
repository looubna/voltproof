// Message formatting shared by server and client components: placeholders and plurals.
// Messages are plain strings (serialisable), so they can be passed to client components.
import { INTL_LOCALE, type Locale } from "./config";

/** Plural forms by CLDR category. English uses one/other; Indonesian and Korean only need other. */
export type Plural = { other: string } & Partial<Record<Exclude<Intl.LDMLPluralRule, "other">, string>>;

/** Marks a message as plural, so the dictionaries' types keep the same shape in every language. */
export const plural = (forms: Plural): Plural => forms;

/** Fills "{name}" placeholders. Unknown placeholders are left as they are, so mistakes stay visible. */
export function format(message: string, values: Record<string, string | number> = {}): string {
  return message.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}

/** Picks the plural form for `count` in this language and fills "{count}" (plus any other values). */
export function formatPlural(locale: Locale, forms: Plural, count: number, values: Record<string, string | number> = {}): string {
  const tag = INTL_LOCALE[locale];
  const category = new Intl.PluralRules(tag).select(count);
  const message = forms[category] ?? forms.other;
  return format(message, { count: count.toLocaleString(tag), ...values });
}
