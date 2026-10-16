// New Zealand Motor Vehicle Register, open data (NZ Transport Agency Waka Kotahi).
// Public ArcGIS feature service, updated monthly, no key. It lists every
// vehicle currently registered in New Zealand with make, model, year, motive
// power, import status and origin, but publishes only the first 11 characters
// of each VIN (VIN11). So a lookup confirms what the government register
// records for vehicles sharing this VIN prefix, not this individual vehicle.
// A live, per-vehicle check needs authorised register access (NZTA Motochek,
// section 241 of the Land Transport Act).
import { normalizeVin } from "../normalize";

export const NZTA_NAME = "NZTA Motor Vehicle Register (NZ open data)";
export const NZTA_SERVICE = process.env.NZTA_MVR_SERVICE_URL || "https://services.arcgis.com/CXBb7LAjgIIdcsPt/arcgis/rest/services/MVR_Mar26/FeatureServer/0";

export interface RegisterGroup {
  n: number;
  MAKE: string | null;
  MODEL: string | null;
  MOTIVE_POWER: string | null;
  VEHICLE_YEAR: number | null;
  IMPORT_STATUS: string | null;
  ORIGINAL_COUNTRY: string | null;
}

export interface RegisterMatch {
  outcome: "ok" | "not_found" | "error";
  data: Record<string, string | null>;
  message: string;
  sourceUrl: string;
}

function top<T extends string | null>(groups: RegisterGroup[], key: keyof RegisterGroup): [T, number][] {
  const m = new Map<T, number>();
  for (const g of groups) m.set(g[key] as T, (m.get(g[key] as T) ?? 0) + g.n);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

export function summariseGroups(vin11: string, groups: RegisterGroup[]): Omit<RegisterMatch, "sourceUrl"> {
  const total = groups.reduce((a, g) => a + g.n, 0);
  if (!total) {
    return { outcome: "not_found", data: { vin11, matches: "0" }, message: `No vehicle currently registered in New Zealand has a VIN starting ${vin11}. That is expected unless the vehicle is, or was, registered in NZ.` };
  }
  const years = groups.map((g) => g.VEHICLE_YEAR).filter((y): y is number => !!y);
  const list = (k: keyof RegisterGroup) => top(groups, k).map(([v, n]) => `${v ?? "unknown"} (${n})`).join(", ");
  const [make] = top<string | null>(groups, "MAKE")[0];
  const [model] = top<string | null>(groups, "MODEL")[0];
  const [power] = top<string | null>(groups, "MOTIVE_POWER")[0];
  return {
    outcome: "ok",
    data: {
      vin11,
      matches: String(total),
      make,
      model,
      motivePower: power,
      years: years.length ? `${Math.min(...years)}–${Math.max(...years)}` : null,
      makes: list("MAKE"),
      models: list("MODEL"),
      motivePowers: list("MOTIVE_POWER"),
      importStatus: list("IMPORT_STATUS"),
      originalCountry: list("ORIGINAL_COUNTRY"),
    },
    message: `${total} vehicle${total === 1 ? "" : "s"} on the NZ register share this VIN prefix: ${list("MODEL")}; motive power ${list("MOTIVE_POWER")}.`,
  };
}

export async function lookupVin11(vin: string, fetchImpl: typeof fetch = fetch, timeoutMs = 45000): Promise<RegisterMatch> {
  const vin11 = normalizeVin(vin).slice(0, 11);
  const sourceUrl = `${NZTA_SERVICE}/query?where=VIN11%3D%27${vin11}%27`;
  // Only VIN characters reach the query, so nothing can be injected into the WHERE clause.
  if (!/^[A-HJ-NPR-Z0-9]{11}$/.test(vin11)) return { outcome: "error", data: {}, message: "The VIN is not well-formed, so the register cannot be searched.", sourceUrl };
  const params = new URLSearchParams({
    where: `VIN11='${vin11}'`,
    outStatistics: JSON.stringify([{ statisticType: "count", onStatisticField: "OBJECTID", outStatisticFieldName: "n" }]),
    groupByFieldsForStatistics: "MAKE,MODEL,MOTIVE_POWER,VEHICLE_YEAR,IMPORT_STATUS,ORIGINAL_COUNTRY",
    f: "json",
  });
  try {
    const res = await fetchImpl(`${NZTA_SERVICE}/query?${params}`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return { outcome: "error", data: {}, message: `The register answered HTTP ${res.status}.`, sourceUrl };
    const json = (await res.json()) as { features?: { attributes: RegisterGroup }[]; error?: { message?: string } };
    if (json.error) return { outcome: "error", data: {}, message: `The register returned an error (${json.error.message ?? "unknown"}).`, sourceUrl };
    return { ...summariseGroups(vin11, (json.features ?? []).map((f) => f.attributes)), sourceUrl };
  } catch (e) {
    return { outcome: "error", data: {}, message: `The register could not be reached (${e instanceof Error ? e.message : String(e)}).`, sourceUrl };
  }
}
