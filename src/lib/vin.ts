// Offline VIN structure checks (ISO 3779 / 49 CFR 565). Pure functions.
// A VIN that passes these checks is well-formed, not genuine: forgers use
// valid VINs. A VIN that fails them is mistyped, misread or invented.
import { normalizeMake, normalizeVin } from "./normalize";

const TRANSLIT: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9, S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
};
const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

/** The check digit (position 9) a VIN should have: "0"–"9" or "X". */
export function expectedCheckDigit(vin: string): string {
  const v = normalizeVin(vin);
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const c = v[i];
    const n = /\d/.test(c) ? Number(c) : TRANSLIT[c];
    sum += (n ?? 0) * WEIGHTS[i];
  }
  const r = sum % 11;
  return r === 10 ? "X" : String(r);
}

export type CheckDigitResult = "valid" | "invalid" | "not_used";

/**
 * North American VINs (first character 1–5) must carry a check digit. Many
 * manufacturers use it worldwide; European VINs often put a filler letter in
 * position 9 instead, which is "not_used".
 */
export function checkDigit(vin: string): CheckDigitResult {
  const v = normalizeVin(vin);
  const c = v[8];
  if (!/[0-9X]/.test(c)) return "not_used";
  return c === expectedCheckDigit(v) ? "valid" : "invalid";
}

export function isNorthAmerican(vin: string) {
  return /^[1-5]/.test(normalizeVin(vin));
}

const YEAR_CODES = "ABCDEFGHJKLMNPRSTVWXY123456789";

/** Model years a position-10 code can mean (it repeats every 30 years). */
export function modelYearsForCode(code: string): number[] {
  const i = YEAR_CODES.indexOf(code.toUpperCase());
  if (i < 0) return [];
  return [1980 + i, 2010 + i, 2040 + i];
}

// World manufacturer identifiers for common EV makers. Not exhaustive; an
// unknown WMI is simply not checked here (the online decoder covers more).
const WMI: [string, string][] = [
  ["KNA", "Kia"], ["KNC", "Kia"], ["KND", "Kia"], ["5XX", "Kia"], ["5XY", "Kia"],
  ["KMH", "Hyundai"], ["KM8", "Hyundai"], ["KMF", "Hyundai"], ["KMJ", "Hyundai"], ["5NM", "Hyundai"], ["5NP", "Hyundai"],
  ["KMT", "Genesis"],
  ["5YJ", "Tesla"], ["7SA", "Tesla"], ["LRW", "Tesla"], ["XP7", "Tesla"], ["7G2", "Tesla"],
  ["WVW", "Volkswagen"], ["WVG", "Volkswagen"], ["WV1", "Volkswagen"], ["WV2", "Volkswagen"], ["1V2", "Volkswagen"], ["3VW", "Volkswagen"],
  ["WAU", "Audi"], ["WA1", "Audi"], ["WUA", "Audi"],
  ["WBA", "BMW"], ["WBY", "BMW"], ["WBS", "BMW"], ["5UX", "BMW"],
  ["WDD", "Mercedes-Benz"], ["W1K", "Mercedes-Benz"], ["W1N", "Mercedes-Benz"], ["WDC", "Mercedes-Benz"], ["4JG", "Mercedes-Benz"],
  ["WP0", "Porsche"], ["WP1", "Porsche"],
  ["JTD", "Toyota"], ["JTE", "Toyota"], ["JTM", "Toyota"], ["JTN", "Toyota"], ["2T3", "Toyota"],
  ["JN1", "Nissan"], ["JN8", "Nissan"], ["SJN", "Nissan"], ["1N4", "Nissan"],
  ["YV1", "Volvo"], ["YV4", "Volvo"], ["LVY", "Volvo"],
  ["LPS", "Polestar"], ["YSM", "Polestar"],
  ["LGX", "BYD"], ["LC0", "BYD"],
  ["TMB", "Skoda"], ["VSS", "Cupra"], ["VF1", "Renault"], ["VF3", "Peugeot"], ["ZFA", "Fiat"],
  ["1FA", "Ford"], ["1FM", "Ford"], ["3FM", "Ford"], ["WF0", "Ford"],
  ["1G1", "Chevrolet"], ["7FC", "Rivian"], ["50E", "Lucid"],
];

export function manufacturerFromWmi(vin: string): string | null {
  const v = normalizeVin(vin);
  return WMI.find(([p]) => v.startsWith(p))?.[1] ?? null;
}

export function makesMatch(a: string, b: string) {
  const x = normalizeMake(a);
  const y = normalizeMake(b);
  return x === y || x.startsWith(y) || y.startsWith(x);
}
