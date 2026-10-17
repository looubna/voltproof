import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { caseSteps } from "@/components/case-steps";
import { addClaims, addDocument, createCase, getCase, listCases, processDocument, setCaseReference } from "@/lib/cases";
import { dashboardRows, filterDashboard, parseDashboardQuery } from "@/lib/dashboard";
import { caseSummary, currentFindings, reviewQueue } from "@/lib/derive";
import { historyEntry } from "@/lib/history";
import { vinStructure } from "@/lib/rules";
import { setStore } from "@/lib/storage";
import { LocalStore } from "@/lib/storage/local";
import { makeDoc, REF, vehicle, VIN_A } from "./helpers";

beforeEach(async () => {
  delete process.env.VOLTPROOF_AI_MODE;
  setStore(new LocalStore(await mkdtemp(path.join(os.tmpdir(), "voltproof-ux-"))));
});

describe("plain-language history", () => {
  it("keeps model names and versions out of new events' main text", async () => {
    const c = await createCase({ make: "Tesla", model: "Model 3", year: 2021, vin: "5YJ3E1EA0MF934821", allowDuplicateVin: true }, "Alex");
    const buf = await readFile(path.join(process.cwd(), "samples", "model3-service-invoice-2026-03.pdf"));
    const doc = await addDocument(c.id, { name: "invoice.pdf", data: buf }, "seller_provided", "Alex");
    const after = await processDocument(c.id, doc.id, "Alex");
    for (const e of after.events) {
      expect(e.detail).not.toMatch(/SHA-256|Rules \d|assessor|fixture|gemini|Vertex/i);
    }
    const uploaded = after.events.find((e) => e.type === "document_added")!;
    expect(uploaded.detail).toBe("invoice.pdf uploaded (provided by seller).");
    expect(uploaded.technical).toMatch(/^SHA-256 [0-9a-f]{12}…$/);
    const read = after.events.find((e) => e.type === "document_extracted")!;
    expect(read.detail).toMatch(/^invoice\.pdf was read and checked\./);
    expect(after.events.find((e) => e.type === "rules_run")!.technical).toMatch(/^Rules \S+, claim assessor \S+$/);
  });

  it("translates events written before the plain-language change", () => {
    const old = (type: string, detail: string, actor = "system") => historyEntry({ at: REF, actor, type, detail });
    expect(old("rules_run", "Rules 2026.10.3 ran (claims updated): 1 conflict, 2 conflict, 5 consistent.")).toMatchObject({
      text: "Checks updated (claims updated): 1 conflict, 2 conflicts, 5 consistent.",
      technical: "Rules 2026.10.3",
      who: "VoltProof (automatic)",
      automatic: true,
    });
    expect(old("document_added", "a.pdf uploaded (seller provided); SHA-256 0123456789ab… — identical to b.pdf already on file.", "Sam")).toMatchObject({
      text: "a.pdf uploaded (seller provided). It is identical to b.pdf, already on file.",
      technical: "SHA-256 0123456789ab…",
      automatic: false,
    });
    expect(old("document_extracted", "x.pdf: Read by gemini-2.5-flash on Vertex AI (live call, 7.2 s). Forensic checks found 2 possible signs of editing.", "Sam")).toMatchObject({
      text: "x.pdf was read and checked. 2 possible signs of editing found.",
      technical: "Read by gemini-2.5-flash on Vertex AI (live call, 7.2 s).",
    });
    expect(old("review_recorded", "VIN consistency: marked resolved.", "Sam").text).toBe("VIN consistency: marked resolved.");
  });
});

describe("dashboard search and filters", () => {
  it("finds cases by model, case number, reference or the last digits of the VIN", async () => {
    await createCase({ make: "Kia", model: "EV6", year: 2022, vin: "KNDC4DLC0N5123456", reference: "Stock A-1042" }, "Sam");
    const rows = dashboardRows(await listCases());
    const find = (q: string) => filterDashboard(rows, { q, show: "all", sort: "newest" }).map((r) => r.c.reference ?? r.c.caseNumber);
    expect(find("a-1042")).toEqual(["Stock A-1042"]);
    expect(find("123456")).toEqual(["Stock A-1042"]);
    expect(find("kia ev6")).toContain("Stock A-1042");
    expect(find("VP-2026-0103")).toEqual(["VP-2026-0103"]);
    expect(find("no such car")).toEqual([]);
  });

  it("filters by stage, sorts, and flags cases that share a VIN", async () => {
    await createCase({ make: "Hyundai", model: "Kona Electric", year: 2020, vin: "KMHK381G8LU072518", allowDuplicateVin: true }, "Sam");
    const rows = dashboardRows(await listCases());
    const kona = rows.filter((r) => r.c.vehicle.vin === "KMHK381G8LU072518");
    expect(kona).toHaveLength(2);
    expect(kona.every((r) => r.sameVin === 1)).toBe(true);
    expect(filterDashboard(rows, { q: "", show: "no_documents", sort: "newest" }).every((r) => r.c.documents.length === 0)).toBe(true);
    expect(filterDashboard(rows, { q: "", show: "conflicts", sort: "newest" }).every((r) => r.summary.openConflicts > 0)).toBe(true);
    const open = filterDashboard(rows, { q: "", show: "all", sort: "open" }).map((r) => r.summary.openReviewItems);
    expect(open).toEqual([...open].sort((a, b) => b - a));
    const names = filterDashboard(rows, { q: "", show: "all", sort: "vehicle" }).map((r) => r.vehicle);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it("ignores unknown query values", () => {
    expect(parseDashboardQuery({ q: "  ev6 ", show: "drop tables", sort: ["oldest", "x"] })).toEqual({ q: "ev6", show: "all", sort: "oldest" });
  });
});

describe("case steps", () => {
  it("leads a new case from uploading to the report", async () => {
    const c = await createCase({ make: "Kia", model: "EV6", year: 2022, vin: "" }, "Sam");
    expect(caseSteps(c).map((s) => s.done)).toEqual([false, false, false, false]);
    const buf = await readFile(path.join(process.cwd(), "samples", "kia-ev6-registration.pdf"));
    const doc = await addDocument(c.id, { name: "reg.pdf", data: buf }, "seller_provided", "Sam");
    await processDocument(c.id, doc.id, "Sam");
    await addClaims(c.id, [{ type: "odometer", stated: { number: 30000, unit: "km" } }], "Sam");
    const steps = caseSteps((await getCase(c.id))!);
    expect(steps[0]).toMatchObject({ done: true, detail: "1 document on file" });
    expect(steps[1]).toMatchObject({ done: true, detail: "1 claim being checked" });
  });
});

describe("a case with no documents yet", () => {
  it("has nothing to review and no 'missing evidence', since nothing was uploaded", async () => {
    const c = await createCase({ make: "Kia", model: "EV6", year: 2022, vin: "" }, "Sam");
    expect(reviewQueue(c)).toEqual([]);
    expect(caseSummary(c)).toMatchObject({ stage: "no_documents", openReviewItems: 0, missingEvidence: 0 });
  });
  it("still shows a real conflict, such as a typed VIN that belongs to another maker", async () => {
    const c = await createCase({ make: "Kia", model: "EV6", year: 2021, vin: "5YJ3E1EA0MF934821", allowDuplicateVin: true }, "Sam");
    expect(reviewQueue(c).map((i) => i.finding.id)).toEqual(["vin-structure"]);
  });
});

describe("VIN check without documents", () => {
  it("is Unknown, not Consistent, when only the typed-in VIN exists", () => {
    const f = vinStructure({ vehicle, documents: [], referenceDate: REF });
    expect(f.status).toBe("unknown");
    expect(f.result).toMatch(/nothing confirms it yet/);
  });
  it("is Consistent once a document shows the same VIN", () => {
    expect(vinStructure({ vehicle, documents: [makeDoc("reg", { vin: VIN_A })], referenceDate: REF }).status).toBe("consistent");
  });
});

describe("case reference", () => {
  it("is saved on creation, can be edited or cleared, and is audited", async () => {
    const c = await createCase({ make: "Kia", model: "EV6", year: 2022, vin: "", reference: "  Stock   A-1042 " }, "Sam");
    expect(c.reference).toBe("Stock A-1042");
    const edited = await setCaseReference(c.id, "Seller: J. Kim", "Sam");
    expect(edited.reference).toBe("Seller: J. Kim");
    expect(edited.events.at(-1)?.detail).toBe("Reference set to “Seller: J. Kim”.");
    expect((await setCaseReference(c.id, "", "Sam")).reference).toBeNull();
    await expect(setCaseReference(c.id, "x".repeat(81), "Sam")).rejects.toThrow(/too long/);
    expect(currentFindings(edited).length).toBeGreaterThan(0);
  });
});
