// Dashboard list: search, filter and sort cases from the URL's query. Pure functions.
import { caseSummary } from "./derive";
import { normalizeVin } from "./normalize";
import type { Case } from "./types";

// Filter and sort choices. Their labels are translated (dashboard.filters in src/i18n/messages).
export const SHOWS = ["all", "awaiting_review", "conflicts", "missing", "review_complete", "processing", "no_documents"] as const;
export type Show = (typeof SHOWS)[number];

export const SORTS = ["newest", "oldest", "open", "vehicle"] as const;
export type Sort = (typeof SORTS)[number];

export interface DashboardQuery {
  q: string;
  show: Show;
  sort: Sort;
}

export interface DashboardRow {
  c: Case;
  summary: ReturnType<typeof caseSummary>;
  /** "2020 Hyundai Kona Electric" */
  vehicle: string;
  /** How many other listed cases have the same VIN. */
  sameVin: number;
}

const pick = <T extends string>(value: unknown, options: readonly T[], fallback: T): T => (typeof value === "string" && (options as readonly string[]).includes(value) ? (value as T) : fallback);

export function parseDashboardQuery(sp: Record<string, string | string[] | undefined>): DashboardQuery {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  return { q: one(sp.q).trim().slice(0, 80), show: pick(one(sp.show), SHOWS, "all"), sort: pick(one(sp.sort), SORTS, "newest") };
}

export function dashboardRows(cases: Case[]): DashboardRow[] {
  const vinCount = new Map<string, number>();
  for (const c of cases) {
    const v = normalizeVin(c.vehicle.vin ?? "");
    if (v) vinCount.set(v, (vinCount.get(v) ?? 0) + 1);
  }
  return cases.map((c) => {
    const v = normalizeVin(c.vehicle.vin ?? "");
    return {
      c,
      summary: caseSummary(c),
      vehicle: [c.vehicle.year, c.vehicle.make, c.vehicle.model].filter(Boolean).join(" "),
      sameVin: v ? (vinCount.get(v) ?? 1) - 1 : 0,
    };
  });
}

/** Every word must match the case number, vehicle, reference or VIN (any part of it, e.g. its last digits). */
function matches(row: DashboardRow, q: string) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const text = [row.c.caseNumber, row.vehicle, row.c.reference ?? ""].join(" ").toLowerCase();
  const vin = normalizeVin(row.c.vehicle.vin ?? "");
  return words.every((w) => text.includes(w) || (w.length >= 3 && vin.includes(normalizeVin(w))));
}

function shown(row: DashboardRow, show: Show) {
  const s = row.summary;
  switch (show) {
    case "all":
      return true;
    case "conflicts":
      return s.openConflicts > 0;
    case "missing":
      return s.missingEvidence > 0;
    default:
      return s.stage === show;
  }
}

export function filterDashboard(rows: DashboardRow[], { q, show, sort }: DashboardQuery): DashboardRow[] {
  const out = rows.filter((r) => shown(r, show) && matches(r, q));
  const byDate = (a: DashboardRow, b: DashboardRow) => (a.c.createdAt < b.c.createdAt ? 1 : a.c.createdAt > b.c.createdAt ? -1 : 0);
  const sorters: Record<Sort, (a: DashboardRow, b: DashboardRow) => number> = {
    newest: byDate,
    oldest: (a, b) => byDate(b, a),
    open: (a, b) => b.summary.openReviewItems - a.summary.openReviewItems || byDate(a, b),
    vehicle: (a, b) => a.vehicle.localeCompare(b.vehicle) || byDate(a, b),
  };
  return out.sort(sorters[sort]);
}
