import { describe, expect, it } from "vitest";
import { assessClaim, claimSummaryLine, DEFAULT_POLICY } from "@/lib/claims/assess";
import { runRules } from "@/lib/rules";
import type { CaseDocument, Claim, ClaimStated, ClaimType, Status } from "@/lib/types";
import { REF, VIN_A, VIN_B, makeDoc, vehicle } from "./helpers";

function claim(type: ClaimType, stated: ClaimStated): Claim {
  return { id: `c-${type}`, type, stated, source: "manual", sourceText: null, createdBy: "t", createdAt: REF };
}

function assess(c: Claim, documents: CaseDocument[], refDate = REF) {
  const input = { vehicle, documents, referenceDate: refDate };
  return assessClaim(c, input, runRules(input, { batteryReportMaxAgeDays: 90 }), DEFAULT_POLICY);
}

const battery = (soh: number, opts: { vin?: string; date?: string; provenance?: CaseDocument["provenance"] } = {}) =>
  makeDoc(
    `bat-${soh}-${opts.vin ?? VIN_A}-${opts.provenance ?? "dealer_ordered"}`,
    { documentType: "battery_report", vin: opts.vin ?? VIN_A, batteryTestDate: opts.date ?? "2026-09-20", batterySohPercent: soh, batteryTestProvider: "Cell Lab" },
    { provenance: opts.provenance ?? "dealer_ordered" },
  );

const invoice = (id: string, date: string, km: number, extra: Record<string, unknown> = {}) =>
  makeDoc(id, { documentType: "service_invoice", vin: VIN_A, documentDate: date, odometer: { reading: km, unit: "km" }, serviceDetails: "Inspection", ...extra });

const dash = (date: string, km: number) => makeDoc(`dash-${date}`, { documentType: "dashboard_photo", documentDate: date, odometer: { reading: km, unit: "km" } }, { provenance: "dealer_captured" });

describe("battery health claim", () => {
  const c = claim("battery_soh", { number: 92, unit: "%" });
  const cases: [string, CaseDocument[], Status][] = [
    ["verified by a recent dealer-ordered report for this VIN", [battery(92)], "verified"],
    ["within tolerance still verifies", [battery(90.5)], "verified"],
    ["consistent when the report came from the seller", [battery(92, { provenance: "seller_provided" })], "consistent"],
    ["consistent when the report is too old", [battery(93, { date: "2026-01-10" })], "consistent"],
    ["conflict when the report is clearly lower", [battery(85)], "conflict"],
    ["conflict when the only report is for another VIN", [battery(92, { vin: VIN_B })], "conflict"],
    ["unknown with no report", [], "unknown"],
  ];
  for (const [name, docs, status] of cases) it(name, () => expect(assess(c, docs).status).toBe(status));

  it("a low-confidence SOH cannot create a conflict", () => {
    const weak = makeDoc("bat-weak", { documentType: "battery_report", vin: VIN_A, batteryTestDate: "2026-09-20", batterySohPercent: 70 }, { provenance: "dealer_ordered", confidence: { batterySohPercent: 0.3 } });
    const f = assess(c, [weak]);
    expect(f.status).toBe("unknown");
    expect(f.evidence.some((e) => e.note?.startsWith("Not used"))).toBe(true);
  });

  it("conflict wins over verification from another report", () => {
    expect(assess(c, [battery(92), battery(80, { provenance: "seller_provided" })]).status).toBe("conflict");
  });

  it("lists the deciding report first in the evidence", () => {
    const f = assess(c, [invoice("i1", "2026-05-01", 30000), battery(92)]);
    expect(f.evidence[0].documentId).toContain("bat-92");
  });

  it("an OBD-II screenshot is recognised as a battery health source", () => {
    const obd = makeDoc("obd-1", { documentType: "obd_screenshot", vin: VIN_A, batteryTestDate: "2026-09-20", batterySohPercent: 92, batteryTestProvider: "LeafSpy Pro" }, { provenance: "dealer_captured" });
    expect(assess(c, [obd]).status).toBe("verified");
  });
});

describe("mileage claim", () => {
  const c = claim("odometer", { number: 40000, unit: "km" });
  it("verified by a fresh dealer-captured dashboard reading", () => expect(assess(c, [dash("2026-09-28", 40200)]).status).toBe("verified"));
  it("conflict when the fresh dashboard reading differs", () => expect(assess(c, [dash("2026-09-28", 45000)]).status).toBe("conflict"));
  it("consistent when records are at or below the claim", () => expect(assess(c, [invoice("i1", "2025-03-01", 30000), invoice("i2", "2026-03-01", 38000)]).status).toBe("consistent"));
  it("conflict when a record is above the claim", () => expect(assess(c, [invoice("i1", "2026-03-01", 43000)]).status).toBe("conflict"));
  it("miles are converted before comparing", () => {
    const miles = claim("odometer", { number: 25000, unit: "mi" }); // ≈ 40,234 km
    expect(assess(miles, [invoice("i1", "2026-03-01", 40000)]).status).toBe("consistent");
  });
  it("conflict when the timeline goes backwards", () => {
    expect(assess(claim("odometer", { number: 50000, unit: "km" }), [invoice("i1", "2025-03-01", 41000), invoice("i2", "2026-03-01", 38000)]).status).toBe("conflict");
  });
  it("unknown with no readings", () => expect(assess(c, []).status).toBe("unknown"));
});

describe("accident history claim", () => {
  const none = claim("accident_history", { flag: false });
  const repair = makeDoc("ins", { documentType: "insurance_or_repair_record", documentDate: "2025-11-03", damageRepair: "rear bumper replaced after collision" });
  it("conflict when a record lists damage repair", () => expect(assess(none, [repair]).status).toBe("conflict"));
  it("consistent with 12+ months of clean service history", () =>
    expect(assess(none, [invoice("i1", "2025-01-10", 20000), invoice("i2", "2026-03-01", 30000)]).status).toBe("consistent"));
  it("unknown with a short history", () => expect(assess(none, [invoice("i1", "2026-01-10", 20000)]).status).toBe("unknown"));
  it("never verified from documents alone", () => expect(assess(none, [invoice("i1", "2023-01-10", 1), invoice("i2", "2026-03-01", 3)]).status).not.toBe("verified"));
  it("a disclosed accident with a matching repair record is consistent", () => expect(assess(claim("accident_history", { flag: true }), [repair]).status).toBe("consistent"));
});

describe("fast-charging claim", () => {
  const c = claim("fast_charging", { number: 30, unit: "%", text: "mostly home charged" });
  const log = (share: number, provenance: CaseDocument["provenance"]) => makeDoc(`log-${share}-${provenance}`, { documentType: "charging_log", dcChargingSharePercent: share }, { provenance });
  it("unknown with no charging data", () => expect(assess(c, []).status).toBe("unknown"));
  it("verified by an independently obtained log", () => expect(assess(c, [log(20, "dealer_ordered")]).status).toBe("verified"));
  it("consistent with a seller log", () => expect(assess(c, [log(20, "seller_provided")]).status).toBe("consistent"));
  it("conflict when the log shows much more DC charging", () => expect(assess(c, [log(70, "dealer_ordered")]).status).toBe("conflict"));
});

describe("claim summary line", () => {
  it("matches the landing page wording", () => {
    const f = (status: Status) => ({ status }) as never;
    expect(claimSummaryLine([f("verified"), f("consistent"), f("conflict"), f("unknown")])).toBe("1 conflict to review before you pay. 2 claims backed by evidence, 1 still missing.");
    expect(claimSummaryLine([])).toBeNull();
  });
});
