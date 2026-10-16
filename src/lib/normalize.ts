import type { Odometer } from "./types";

export const KM_PER_MILE = 1.609344;

/** Uppercase, strip whitespace and dashes. Does not "fix" characters. */
export function normalizeVin(vin: string): string {
  return vin.toUpperCase().replace(/[\s-]/g, "");
}

/** ISO 3779 shape: 17 chars, no I, O or Q. Check digits are not enforced (region-specific). */
export function isWellFormedVin(vin: string): boolean {
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(normalizeVin(vin));
}

export function vinTail(vin: string): string {
  return normalizeVin(vin).slice(-4);
}

const MAKE_ALIASES: Record<string, string> = {
  vw: "volkswagen",
  mercedes: "mercedesbenz",
  hyundaimotorcompany: "hyundai",
  kiamotors: "kia",
  kiacorporation: "kia",
  teslainc: "tesla",
  teslamotors: "tesla",
};

export function normalizeMake(make: string): string {
  const k = make.toLowerCase().replace(/[^a-z0-9]/g, "");
  return MAKE_ALIASES[k] ?? k;
}

export function normalizeModel(model: string): string {
  return model.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Models match when equal after normalisation, or when one is a prefix of the
 * other (a trim/variant suffix such as "Model 3" vs "Model 3 Long Range").
 */
export function modelsMatch(a: string, b: string): "same" | "trim_variant" | "different" {
  const x = normalizeModel(a);
  const y = normalizeModel(b);
  if (!x || !y) return "different";
  if (x === y) return "same";
  if (x.startsWith(y) || y.startsWith(x)) return "trim_variant";
  return "different";
}

export function toKm(o: Odometer): number {
  return o.unit === "mi" ? o.reading * KM_PER_MILE : o.reading;
}

export function formatOdometer(o: Odometer): string {
  return `${o.reading.toLocaleString("en-US")} ${o.unit}`;
}

export type ParsedDate = { ok: true; date: Date; iso: string } | { ok: false; reason: string };

/** Strict YYYY-MM-DD parsing that rejects impossible dates such as 2026-02-30. */
export function parseIsoDate(value: string): ParsedDate {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return { ok: false, reason: `"${value}" is not in YYYY-MM-DD form` };
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) {
    return { ok: false, reason: `"${value}" is not a real calendar date` };
  }
  return { ok: true, date, iso: value.trim() };
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}
