// Error messages the server returns to people, in their language. Errors carry a code and
// values (see UserError in src/lib/cases.ts); the text is chosen when the response is sent.
import { INTL_LOCALE, type Locale } from "./config";
import { format, formatPlural, type Plural } from "./format";
import { MESSAGES } from "./messages/catalog";
import type { Messages } from "./messages/en";

export type ErrorCode = keyof Messages["errors"];
export type ErrorValues = Record<string, string | number>;

export function errorText(code: ErrorCode, locale: Locale, values: ErrorValues = {}): string {
  const message: string | Plural = MESSAGES[locale].errors[code];
  const tag = INTL_LOCALE[locale];
  const shown = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, typeof v === "number" ? v.toLocaleString(tag) : v]));
  return typeof message === "string" ? format(message, shown) : formatPlural(locale, message, Number(values.count ?? 0), shown);
}
