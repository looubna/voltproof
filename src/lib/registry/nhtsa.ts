// NHTSA vPIC VIN decoder (US Department of Transportation). Free, no API key,
// rate-limited. It decodes what the VIN encodes (make, model, year, plant,
// electrification) from manufacturer submissions. It is a reference decode,
// not a registration, ownership or history record. Coverage is best for
// vehicles sold in North America; others often decode make and year only.
import { isNorthAmerican } from "../vin";

export const VPIC_NAME = "US NHTSA VIN database";

export interface VinDecode {
  outcome: "ok" | "not_found" | "error";
  data: Record<string, string | null>;
  message: string;
  sourceUrl: string;
}

const KEEP: Record<string, string> = {
  Make: "make",
  Model: "model",
  ModelYear: "modelYear",
  ElectrificationLevel: "electrification",
  PlantCountry: "plantCountry",
  Manufacturer: "manufacturer",
  VehicleType: "vehicleType",
  BatteryInfo: "batteryInfo",
};

const blank = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

export function parseVpic(json: unknown, vin: string): Omit<VinDecode, "sourceUrl"> {
  const r = (json as { Results?: Record<string, unknown>[] })?.Results?.[0];
  if (!r) return { outcome: "error", data: {}, message: "The decoder returned no result." };
  const data: Record<string, string | null> = {};
  for (const [from, to] of Object.entries(KEEP)) data[to] = blank(r[from]);
  if (data.model === null) delete data.model;
  const codes = String(r.ErrorCode ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  // Codes: 0 clean, 1 check digit, 8 no detailed data, 400 invalid characters (often a non-numeric position 9).
  const notes = blank(r.ErrorText) ?? "";
  if (!data.make) return { outcome: "not_found", data, message: `The decoder could not identify this VIN. ${notes}`.trim() };
  const partial = codes.some((c) => c !== "0");
  const checkDigitNote = codes.includes("1") && !isNorthAmerican(vin) ? " The check-digit warning is expected for VINs from markets that do not use one." : "";
  return {
    outcome: "ok",
    data,
    message: partial ? `Partial decode. NHTSA notes: ${notes}.${checkDigitNote}` : "VIN decoded clean; check digit correct.",
  };
}

export async function decodeVin(vin: string, modelYear: number | null, fetchImpl: typeof fetch = fetch, timeoutMs = 15000): Promise<VinDecode> {
  const url = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}?format=json${modelYear ? `&modelyear=${modelYear}` : ""}`;
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs), headers: { Accept: "application/json" } });
    if (!res.ok) return { outcome: "error", data: {}, message: `The decoder answered HTTP ${res.status}.`, sourceUrl: url };
    return { ...parseVpic(await res.json(), vin), sourceUrl: url };
  } catch (e) {
    return { outcome: "error", data: {}, message: `The decoder could not be reached (${e instanceof Error ? e.message : String(e)}).`, sourceUrl: url };
  }
}
