import { describe, expect, it } from "vitest";
import {
  batteryHealthEvidence,
  batteryReportAge,
  batteryReportVin,
  currentOdometer,
  dateConsistency,
  extractionFindings,
  mileageTimeline,
  runRules,
  vehicleConsistency,
  vinConsistency,
} from "@/lib/rules";
import { makeDoc, REF, vehicle, VIN_A, VIN_B } from "./helpers";

const input = (documents: ReturnType<typeof makeDoc>[], v = vehicle) => ({ vehicle: v, documents, referenceDate: REF });
const opts = { batteryReportMaxAgeDays: 90 };

describe("VIN consistency", () => {
  it("is consistent when all VINs match the case", () => {
    const f = vinConsistency(input([makeDoc("a", { vin: VIN_A }), makeDoc("b", { vin: VIN_A.toLowerCase() })]));
    expect(f.status).toBe("consistent");
  });
  it("flags a mismatching VIN as a conflict and names both tails", () => {
    const f = vinConsistency(input([makeDoc("reg", { vin: VIN_A }), makeDoc("inv", { vin: VIN_B })]));
    expect(f.status).toBe("conflict");
    expect(f.result).toContain("7730");
    expect(f.result).toContain("4821");
    expect(f.requiresReview).toBe(true);
  });
  it("treats missing VINs as unknown, not conflict", () => {
    expect(vinConsistency(input([makeDoc("a", { make: "Tesla" })])).status).toBe("unknown");
  });
  it("ignores battery reports (checked by their own rule)", () => {
    const f = vinConsistency(input([makeDoc("reg", { vin: VIN_A }), makeDoc("bat", { documentType: "battery_report", vin: VIN_B })]));
    expect(f.status).toBe("consistent");
  });
});

describe("Vehicle consistency", () => {
  it("accepts trim variants and case differences", () => {
    const f = vehicleConsistency(input([makeDoc("a", { make: "TESLA", model: "MODEL 3 Long Range" })]));
    expect(f.status).toBe("consistent");
    expect(f.result).toContain("trim");
  });
  it("flags a different model", () => {
    expect(vehicleConsistency(input([makeDoc("a", { make: "Tesla", model: "Model Y" })])).status).toBe("conflict");
  });
  it("flags a different make", () => {
    expect(vehicleConsistency(input([makeDoc("a", { make: "Kia", model: "Model 3" })])).status).toBe("conflict");
  });
});

describe("Mileage timeline", () => {
  it("is consistent when readings increase", () => {
    const f = mileageTimeline(input([
      makeDoc("a", { documentDate: "2025-01-01", odometer: { reading: 10000, unit: "km" } }),
      makeDoc("b", { documentDate: "2026-01-01", odometer: { reading: 20000, unit: "km" } }),
    ]));
    expect(f.status).toBe("consistent");
  });
  it("flags a decrease over time", () => {
    const f = mileageTimeline(input([
      makeDoc("inv", { documentDate: "2026-03-12", odometer: { reading: 41200, unit: "km" } }),
      makeDoc("photo", { documentDate: "2026-09-20", odometer: { reading: 38900, unit: "km" } }),
    ]));
    expect(f.status).toBe("conflict");
    expect(f.result).toContain("41,200 km");
    expect(f.result).toContain("38,900 km");
    expect(f.result).toMatch(/not, by itself, proof/);
  });
  it("orders by date, not by upload order", () => {
    const f = mileageTimeline(input([
      makeDoc("late", { documentDate: "2026-06-01", odometer: { reading: 30000, unit: "km" } }),
      makeDoc("early", { documentDate: "2025-06-01", odometer: { reading: 20000, unit: "km" } }),
    ]));
    expect(f.status).toBe("consistent");
  });
  it("converts miles before comparing (10,000 mi > 15,000 km)", () => {
    const f = mileageTimeline(input([
      makeDoc("a", { documentDate: "2025-01-01", odometer: { reading: 15000, unit: "km" } }),
      makeDoc("b", { documentDate: "2026-01-01", odometer: { reading: 10000, unit: "mi" } }),
    ]));
    expect(f.status).toBe("consistent");
  });
  it("detects a decrease hidden by a unit change (20,000 km then 11,000 mi ≈ 17,703 km)", () => {
    const f = mileageTimeline(input([
      makeDoc("a", { documentDate: "2025-01-01", odometer: { reading: 20000, unit: "km" } }),
      makeDoc("b", { documentDate: "2026-01-01", odometer: { reading: 11000, unit: "mi" } }),
    ]));
    expect(f.status).toBe("conflict");
  });
  it("does not flag equivalent readings in different units on the same scale", () => {
    const f = mileageTimeline(input([
      makeDoc("a", { documentDate: "2025-01-01", odometer: { reading: 16093, unit: "km" } }),
      makeDoc("b", { documentDate: "2025-02-01", odometer: { reading: 10000, unit: "mi" } }),
    ]));
    expect(f.status).toBe("consistent");
  });
  it("is unknown with missing readings or dates, never a conflict", () => {
    expect(mileageTimeline(input([makeDoc("a", { documentDate: "2025-01-01" })])).status).toBe("unknown");
    const f = mileageTimeline(input([
      makeDoc("a", { odometer: { reading: 50000, unit: "km" } }),
      makeDoc("b", { documentDate: "2026-01-01", odometer: { reading: 10000, unit: "km" } }),
    ]));
    expect(f.status).toBe("unknown");
    expect(f.evidence.some((e) => e.note?.includes("no usable date"))).toBe(true);
  });
  it("uses the battery test date for battery report readings", () => {
    const f = mileageTimeline(input([
      makeDoc("inv", { documentDate: "2026-05-01", odometer: { reading: 30000, unit: "km" } }),
      makeDoc("bat", { documentType: "battery_report", documentDate: "2026-04-01", batteryTestDate: "2026-06-01", odometer: { reading: 31000, unit: "km" } }),
    ]));
    expect(f.status).toBe("consistent");
  });
});

describe("Date consistency", () => {
  it("flags an impossible date", () => {
    const f = dateConsistency(input([makeDoc("a", { documentDate: "2026-02-30" })]));
    expect(f.status).toBe("conflict");
    expect(f.result).toContain("not a real calendar date");
  });
  it("flags a non-ISO date", () => {
    expect(dateConsistency(input([makeDoc("a", { documentDate: "12/03/2026" })])).status).toBe("conflict");
  });
  it("flags a date after the review date", () => {
    expect(dateConsistency(input([makeDoc("a", { documentDate: "2027-01-01" })])).status).toBe("conflict");
  });
  it("flags a date long before the model year", () => {
    expect(dateConsistency(input([makeDoc("a", { documentDate: "2015-01-01" })])).status).toBe("conflict");
  });
  it("treats missing dates as unknown, not conflict", () => {
    const f = dateConsistency(input([makeDoc("a", { vin: VIN_A })]));
    expect(f.status).toBe("unknown");
  });
  it("is consistent for valid dates and lists undated documents", () => {
    const f = dateConsistency(input([makeDoc("a", { documentDate: "2025-01-01" }), makeDoc("b", { vin: VIN_A })]));
    expect(f.status).toBe("consistent");
    expect(f.result).toContain("No date found");
  });
});

describe("Battery rules", () => {
  it("missing battery report → battery health unknown with test recommendation", () => {
    const i = input([makeDoc("reg", { vin: VIN_A })]);
    const v = batteryReportVin(i);
    const a = batteryReportAge(i, opts);
    const h = batteryHealthEvidence(i, v, a);
    expect([v.status, a.status, h.status]).toEqual(["unknown", "unknown", "unknown"]);
    expect(h.nextAction).toMatch(/independent battery test/);
    expect(h.decisionImpact).toBe(true);
  });
  it("battery report for another VIN is a conflict", () => {
    const i = input([makeDoc("bat", { documentType: "battery_report", vin: VIN_B, batteryTestDate: "2026-09-15", batterySohPercent: 90 })]);
    const v = batteryReportVin(i);
    expect(v.status).toBe("conflict");
    expect(batteryHealthEvidence(i, v, batteryReportAge(i, opts)).status).toBe("conflict");
  });
  it("matching recent report is consistent and SOH is quoted as reported, not certified", () => {
    const i = input([makeDoc("bat", { documentType: "battery_report", vin: VIN_A, batteryTestDate: "2026-09-15", batterySohPercent: 91, batteryTestProvider: "Lab X" })]);
    const v = batteryReportVin(i);
    const a = batteryReportAge(i, opts);
    const h = batteryHealthEvidence(i, v, a);
    expect(v.status).toBe("consistent");
    expect(a.status).toBe("consistent");
    expect(h.status).toBe("consistent");
    expect(h.result).toContain("91% state of health, as reported by Lab X");
    expect(h.result).toMatch(/did not test the battery/);
  });
  it("old report fails the age check", () => {
    const i = input([makeDoc("bat", { documentType: "battery_report", vin: VIN_A, batteryTestDate: "2026-01-10", batterySohPercent: 91 })]);
    const a = batteryReportAge(i, opts);
    expect(a.status).toBe("conflict");
    expect(batteryReportAge(i, { batteryReportMaxAgeDays: 365 }).status).toBe("consistent");
  });
  it("report without VIN is unknown", () => {
    const i = input([makeDoc("bat", { documentType: "battery_report", batterySohPercent: 91 })]);
    expect(batteryReportVin(i).status).toBe("unknown");
  });
});

describe("Low-confidence and unsupported extraction", () => {
  it("excludes a low-confidence VIN so it cannot create a conflict, and sends it to review", () => {
    const docs = [makeDoc("reg", { vin: VIN_A }), makeDoc("blurry", { vin: VIN_B }, { confidence: { vin: 0.4 } })];
    const f = vinConsistency(input(docs));
    expect(f.status).toBe("consistent");
    expect(f.evidence.find((e) => e.documentId === "blurry")?.note).toMatch(/below the 0.7 threshold/);
    const x = extractionFindings(input(docs));
    expect(x).toHaveLength(1);
    expect(x[0].requiresReview).toBe(true);
    expect(x[0].decisionImpact).toBe(true);
  });
  it("excludes a value with no supporting quote", () => {
    const docs = [makeDoc("a", { documentDate: "2025-01-01", odometer: { reading: 50000, unit: "km" } }), makeDoc("b", { documentDate: "2026-01-01", odometer: { reading: 100, unit: "km" } }, { noQuote: ["odometer"] })];
    expect(mileageTimeline(input(docs)).status).toBe("unknown");
    expect(extractionFindings(input(docs))[0].result).toContain("Odometer");
  });
  it("reports documents that could not be read", () => {
    const x = extractionFindings(input([makeDoc("u", {}, { status: "not_configured" })]));
    expect(x[0].title).toBe("Document not read");
    expect(x[0].status).toBe("unknown");
  });
});

describe("Current odometer and statuses", () => {
  it("is verified only for dealer-captured readings and says what was verified", () => {
    const seller = currentOdometer(input([makeDoc("p", { documentDate: "2026-09-20", odometer: { reading: 38900, unit: "km" } })]));
    expect(seller.status).toBe("unknown");
    const dealer = currentOdometer(input([makeDoc("p", { documentDate: "2026-09-20", odometer: { reading: 38900, unit: "km" } }, { provenance: "dealer_captured" })]));
    expect(dealer.status).toBe("verified");
    expect(dealer.result).toMatch(/^What was verified/);
    expect(dealer.result).toMatch(/does not verify the vehicle's mileage history/);
  });
  it("always includes an authenticity-not-verified finding and never uses the word fraudulent", () => {
    const all = runRules(input([makeDoc("a", { vin: VIN_B, documentDate: "2026-03-12", odometer: { reading: 41200, unit: "km" } }), makeDoc("b", { documentDate: "2026-09-20", odometer: { reading: 38900, unit: "km" } })]), opts);
    expect(all.find((f) => f.id === "authenticity")?.title).toBe("Authenticity not verified");
    for (const f of all) expect(JSON.stringify(f)).not.toMatch(/fraudulent/i);
  });
});

describe("registration number", () => {
  it("is consistent when documents agree and a conflict when they differ", async () => {
    const { registrationConsistency } = await import("@/lib/rules");
    const a = makeDoc("a", { registrationNumber: "61 VW 2071" });
    const b = makeDoc("b", { registrationNumber: "61VW-2071" });
    const c = makeDoc("c", { registrationNumber: "12 AB 3456" });
    expect(registrationConsistency({ vehicle, documents: [a, b], referenceDate: REF }).status).toBe("consistent");
    expect(registrationConsistency({ vehicle, documents: [a, b, c], referenceDate: REF }).status).toBe("conflict");
    expect(registrationConsistency({ vehicle, documents: [], referenceDate: REF }).status).toBe("unknown");
  });
});
