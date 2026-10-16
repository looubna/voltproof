import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { addClaims, addDocument, addReview, createCase, getCase, listCases, processDocument, resetSampleCase, setCaseArchived, setDocumentProvenance, UserError } from "@/lib/cases";
import { currentFindings, decisionImpactItems, reviewState, caseSummary } from "@/lib/derive";
import { buildReport } from "@/lib/report";
import { SAMPLE_CASES } from "@/lib/samples/definitions";
import { setStore } from "@/lib/storage";
import { LocalStore } from "@/lib/storage/local";

beforeEach(async () => {
  delete process.env.VOLTPROOF_AI_MODE;
  setStore(new LocalStore(await mkdtemp(path.join(os.tmpdir(), "voltproof-test-"))));
});

describe("synthetic demonstration cases", () => {
  it("seed all synthetic cases with the expected rule and claim outcomes", async () => {
    const cases = await listCases();
    expect(cases.filter((c) => c.synthetic)).toHaveLength(SAMPLE_CASES.length);
    for (const sc of SAMPLE_CASES) {
      const c = (await getCase(sc.id))!;
      const byId = Object.fromEntries(currentFindings(c).map((f) => [f.id, f.status]));
      for (const [id, status] of Object.entries(sc.expected)) expect({ case: sc.id, id, status: byId[id] }).toEqual({ case: sc.id, id, status });
      const byType = Object.fromEntries(currentFindings(c).filter((f) => f.claim).map((f) => [f.claim!.type, f.status]));
      expect({ case: sc.id, claims: byType }).toEqual({ case: sc.id, claims: sc.expectedClaims ?? {} });
      // Clean samples: no integrity indicators or extraction problems. Doctored samples: exactly the planted ones.
      const planted = c.documents.flatMap((d) => (d.forensics?.indicators ?? []).filter((i) => i.severity === "potential").map((i) => `${d.sampleId}:${i.field ?? ""}:${i.code}`));
      if (sc.expectedTamper) {
        for (const t of sc.expectedTamper) expect(planted).toContain(t);
      } else {
        expect(planted).toEqual([]);
        expect(currentFindings(c).filter((f) => f.category === "integrity" || f.category === "extraction")).toEqual([]);
      }
    }
  });

  it("Case 1 Decision Impact recommends an independent battery test", async () => {
    const c = (await getCase("demo-kia-ev6"))!;
    const open = decisionImpactItems(c).open;
    // The seller's battery claim carries the missing evidence; the rule-level Unknown is not repeated.
    expect(open.map((o) => o.finding.claim?.type)).toEqual(["battery_soh"]);
    expect(open[0].finding.nextAction).toMatch(/independent battery test/);
  });

  it("Case 3 flags mileage and VIN, explains it is not proof of fraud, and asks for cluster records", async () => {
    const c = (await getCase("demo-tesla-model3"))!;
    const open = decisionImpactItems(c).open.map((o) => o.finding);
    expect(open.slice(0, 2).map((f) => f.status)).toEqual(["conflict", "conflict"]);
    const mileage = open.find((f) => f.id === "mileage-timeline")!;
    expect(mileage.result).toContain("41,200 km on 2026-03-12");
    expect(mileage.result).toContain("38,900 km on 2026-09-20");
    expect(mileage.result).toMatch(/not, by itself, proof/);
    expect(mileage.nextAction).toMatch(/instrument-cluster/);
    const vin = open.find((f) => f.id === "vin-consistency")!;
    expect(vin.result).toMatch(/ending 7730/);
    expect(vin.result).toMatch(/ending 4821/);
  });
});

describe("case workflow", () => {
  it("creates a case, ingests a sample document in demo mode and runs rules", async () => {
    const c = await createCase({ make: "Tesla", model: "Model 3", year: 2021, vin: "5YJ3E1EA0MF934821", allowDuplicateVin: true }, "Alex");
    const buf = await readFile(path.join(process.cwd(), "samples", "model3-service-invoice-2026-03.pdf"));
    const doc = await addDocument(c.id, { name: "invoice.pdf", data: buf }, "seller_provided", "Alex");
    expect(doc.integrity.sha256).toHaveLength(64);
    const after = await processDocument(c.id, doc.id, "Alex");
    const d = after.documents[0];
    expect(d.extractionStatus).toBe("extracted");
    expect(d.extraction?.mode).toBe("demo-fixture");
    expect(currentFindings(after).find((f) => f.id === "vin-consistency")?.status).toBe("conflict");
  });

  it("stores but does not read unknown uploads in demo mode, and never fakes extraction", async () => {
    const c = await createCase({ make: "Kia", model: "EV6", year: 2022, vin: "" }, "Alex");
    const fakePdf = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
    const doc = await addDocument(c.id, { name: "scan.pdf", data: fakePdf }, "seller_provided", "Alex");
    const after = await processDocument(c.id, doc.id, "Alex");
    expect(after.documents[0].extractionStatus).toBe("not_configured");
    expect(after.documents[0].extraction).toBeNull();
    expect(currentFindings(after).find((f) => f.id === `document-not-read:${doc.id}`)?.status).toBe("unknown");
  });

  it("rejects unsupported and oversized files", async () => {
    const c = await createCase({ make: "Kia", model: "EV6", year: 2022, vin: "" }, "Alex");
    await expect(addDocument(c.id, { name: "x.exe", data: Buffer.from("MZ....") }, "seller_provided", "Alex")).rejects.toThrow(/not a PDF, JPG or PNG/);
    process.env.MAX_UPLOAD_MB = "1";
    await expect(addDocument(c.id, { name: "big.pdf", data: Buffer.concat([Buffer.from("%PDF-"), Buffer.alloc(2 * 1024 * 1024)]) }, "seller_provided", "Alex")).rejects.toThrow(/larger than/);
    delete process.env.MAX_UPLOAD_MB;
  });

  it("validates case input", async () => {
    await expect(createCase({ make: "", model: "EV6", year: 2022, vin: "" }, "A")).rejects.toThrow(/required/);
    await expect(createCase({ make: "Kia", model: "EV6", year: 1900, vin: "" }, "A")).rejects.toThrow(/model year/);
  });

  it("rejects VINs that cannot be real", async () => {
    await expect(createCase({ make: "Kia", model: "EV6", year: 2022, vin: "IOQ123" }, "A")).rejects.toThrow(/I, O or Q/);
    await expect(createCase({ make: "Kia", model: "EV6", year: 2022, vin: "KNDC3DLC5N509821" }, "A")).rejects.toThrow(/exactly 17 characters; this one has 16/);
    await expect(createCase({ make: "Kia", model: "EV6", year: 2022, vin: "KNDC3DLC5N50982#3" }, "A")).rejects.toThrow(/letters and digits/);
  });

  it("warns about an existing case for the same VIN until the duplicate is confirmed", async () => {
    const vin = "KNDC4DLC0N5123456";
    const first = await createCase({ make: "Kia", model: "EV6", year: 2022, vin }, "A");
    const err = await createCase({ make: "Kia", model: "EV6", year: 2022, vin: vin.toLowerCase() }, "A").catch((e) => e);
    expect(err).toBeInstanceOf(UserError);
    expect(err.status).toBe(409);
    expect(err.details.duplicates.map((d: { id: string }) => d.id)).toContain(first.id);
    const second = await createCase({ make: "Kia", model: "EV6", year: 2022, vin, allowDuplicateVin: true }, "A");
    expect(second.id).not.toBe(first.id);
  });
});

describe("document source and archiving", () => {
  it("records a change of document source and re-runs the rules with it", async () => {
    const c = await createCase({ make: "Kia", model: "EV6", year: 2022, vin: "" }, "A");
    const buf = await readFile(path.join(process.cwd(), "samples", "kia-ev6-dashboard-photo.png"));
    const doc = await addDocument(c.id, { name: "dash.png", data: buf }, "seller_provided", "A");
    const read = await processDocument(c.id, doc.id, "A");
    expect(currentFindings(read).find((f) => f.id === "current-odometer")?.status).toBe("unknown");
    const after = await setDocumentProvenance(c.id, doc.id, "dealer_captured", "Sam");
    expect(after.documents[0].provenance).toBe("dealer_captured");
    expect(currentFindings(after).find((f) => f.id === "current-odometer")?.status).toBe("verified");
    expect(after.events.at(-2)?.detail).toMatch(/source changed from “Provided by seller” to “Captured by dealership staff”/);
    await expect(setDocumentProvenance(c.id, doc.id, "trust_me", "Sam")).rejects.toThrow(/Choose where/);
  });

  it("archives a case out of the lists without losing it, and restores it", async () => {
    const c = await createCase({ make: "Kia", model: "EV6", year: 2022, vin: "" }, "A");
    await setCaseArchived(c.id, true, "Sam");
    expect((await listCases()).some((x) => x.id === c.id)).toBe(false);
    expect((await listCases({ includeArchived: true })).find((x) => x.id === c.id)?.archivedBy).toBe("Sam");
    await setCaseArchived(c.id, false, "Sam");
    expect((await listCases()).some((x) => x.id === c.id)).toBe(true);
    await expect(setCaseArchived("demo-kia-ev6", true, "Sam")).rejects.toThrow(/cannot be archived/);
  });

  it("names the claim type once in validation errors", async () => {
    const c = await createCase({ make: "Kia", model: "EV6", year: 2022, vin: "" }, "A");
    await expect(addClaims(c.id, [{ type: "battery_soh", stated: { number: 140 } }], "A")).rejects.toThrow(/^Battery health must be a percentage between 1 and 100\.$/);
  });
});

describe("human review", () => {
  it("records a resolution without changing the machine finding and keeps history", async () => {
    const id = "demo-tesla-model3";
    const before = (await getCase(id))!;
    const finding = currentFindings(before).find((f) => f.id === "mileage-timeline")!;
    await addReview(id, finding.id, { resolution: "more_info_requested", note: "Asked seller for cluster repair invoice." }, "Jordan");
    const after = await addReview(id, finding.id, { resolution: "resolved", note: "Cluster replaced 2026-04 per workshop record HEM-26-0499; reading reset." }, "Jordan");

    const f2 = currentFindings(after).find((f) => f.id === "mileage-timeline")!;
    expect(f2.status).toBe("conflict"); // machine finding untouched
    expect(f2.result).toBe(finding.result);
    expect(after.reviews).toHaveLength(2);
    expect(after.reviews[0].resolution).toBe("more_info_requested"); // history kept
    expect(after.reviews[1].reviewer).toBe("Jordan");
    expect(after.reviews[1].at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(reviewState(after, f2).open).toBe(false);
    expect(decisionImpactItems(after).resolved.map((r) => r.finding.id)).toContain("mileage-timeline");
    expect(after.events.some((e) => e.type === "review_recorded" && e.actor === "Jordan")).toBe(true);
    expect(caseSummary(after).openConflicts).toBe(2); // VIN conflict and the seller's mileage claim still open
  });

  it("requires a note and a valid resolution", async () => {
    await expect(addReview("demo-tesla-model3", "mileage-timeline", { resolution: "resolved", note: "" }, "J")).rejects.toThrow(/note/);
    await expect(addReview("demo-tesla-model3", "mileage-timeline", { resolution: "approve", note: "ok ok" }, "J")).rejects.toThrow(/resolution/);
  });

  it("re-opens a resolved finding when the machine result later changes", async () => {
    const c = await createCase({ make: "Tesla", model: "Model 3", year: 2021, vin: "5YJ3E1EA0MF934821", allowDuplicateVin: true }, "A");
    const read = async (file: string) => readFile(path.join(process.cwd(), "samples", file));
    const d1 = await addDocument(c.id, { name: "a.pdf", data: await read("model3-service-invoice-2026-03.pdf") }, "seller_provided", "A");
    await processDocument(c.id, d1.id, "A");
    await addReview(c.id, "vin-consistency", { resolution: "resolved", note: "Typo by workshop, confirmed by phone." }, "A");
    const d2 = await addDocument(c.id, { name: "b.pdf", data: await read("model3-service-invoice-2025-08.pdf") }, "seller_provided", "A");
    const after = await processDocument(c.id, d2.id, "A");
    const vin = currentFindings(after).find((f) => f.id === "vin-consistency")!;
    // New evidence arrived after the review, so the earlier resolution is stale and the item is open again.
    expect(reviewState(after, vin).stale).toBe(true);
    expect(reviewState(after, vin).open).toBe(true);
  });

  it("resetting a synthetic case restores it", async () => {
    await addReview("demo-kia-ev6", "battery-health", { resolution: "unresolved", note: "Test booked." }, "J");
    const c = await resetSampleCase("demo-kia-ev6", "J");
    expect(c.reviews).toHaveLength(0);
  });
});

describe("report", () => {
  it("retains source references, reviewer notes and the authenticity statement", async () => {
    await addReview("demo-tesla-model3", "vin-consistency", { resolution: "unresolved", note: "Waiting for workshop to confirm VIN." }, "Jordan");
    const r = buildReport((await getCase("demo-tesla-model3"))!, "Jordan");
    const odo = r.keyFacts.find((k) => k.value === "41,200 km")!;
    expect(odo).toMatchObject({ page: 1, quote: "Odometer: 41,200 km", documentName: "model3-service-invoice-2026-03.pdf" });
    const mileage = r.checks.find((c) => c.id === "mileage-timeline")!;
    expect(mileage.evidence.every((e) => e.quote && e.page)).toBe(true);
    expect(r.reviewerNotes[0]).toMatchObject({ reviewer: "Jordan", resolution: "Unresolved" });
    expect(r.authenticityStatement).toMatch(/^Authenticity not verified/);
    expect(r.unresolved.length).toBeGreaterThan(0);
    expect(r.nextSteps.some((s) => /instrument-cluster/.test(s))).toBe(true);
    expect(r.synthetic).toBe(true);
    expect(JSON.stringify(r)).not.toMatch(/price|valuation of|fraud probability|loan approv/i);
  });
});
