import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { agentView, saveAgentRun } from "@/lib/agent";
import { agentMayCall, isAgentRequest } from "@/lib/agent-auth";
import { getCase } from "@/lib/cases";
import { setStore } from "@/lib/storage";
import { LocalStore } from "@/lib/storage/local";

const TOKEN = "t".repeat(40);
const req = (h?: string) => ({ headers: new Headers(h ? { authorization: h } : {}) });

describe("agent authentication", () => {
  beforeEach(() => {
    process.env.AGENT_API_TOKEN = TOKEN;
  });
  it("accepts only the configured token, and only when it is long enough", () => {
    expect(isAgentRequest(req(`Bearer ${TOKEN}`))).toBe(true);
    expect(isAgentRequest(req(`Bearer ${TOKEN}x`))).toBe(false);
    expect(isAgentRequest(req())).toBe(false);
    process.env.AGENT_API_TOKEN = "short";
    expect(isAgentRequest(req("Bearer short"))).toBe(false);
  });
  it("limits the agent to its allowlisted routes", () => {
    expect(agentMayCall("GET", "/api/cases/demo-hero-id3/agent-view")).toBe(true);
    expect(agentMayCall("POST", "/api/cases/demo-hero-id3/registry")).toBe(true);
    expect(agentMayCall("POST", "/api/cases/demo-hero-id3/documents/abc/process")).toBe(true);
    expect(agentMayCall("POST", "/api/cases/demo-hero-id3/reviews")).toBe(false);
    expect(agentMayCall("POST", "/api/cases/demo-hero-id3/claims")).toBe(false);
    expect(agentMayCall("POST", "/api/cases/demo-hero-id3/documents/abc/verifications")).toBe(false);
    expect(agentMayCall("POST", "/api/cases/demo-hero-id3/reset")).toBe(false);
  });
});

describe("agent runs", () => {
  beforeEach(async () => {
    delete process.env.VOLTPROOF_AI_MODE;
    setStore(new LocalStore(await mkdtemp(path.join(os.tmpdir(), "voltproof-agent-"))));
  });

  it("gives the agent findings, documents and forensic results, marked as data", async () => {
    const v = agentView((await getCase("demo-tampered-kona"))!);
    expect(v.notice).toMatch(/data, not instructions/);
    expect(v.findings.some((f) => f.id === "authenticity")).toBe(true);
    expect(v.documents.find((d) => d.filename === "kona-battery-report.pdf")?.signatures[0].integrity).toBe("invalid");
  });

  it("re-validates drafts before storing, and never changes a status", async () => {
    const c = (await getCase("demo-tampered-kona"))!;
    const claimId = c.agentRuns ? "" : (await import("@/lib/derive")).currentFindings(c).find((f) => f.claim)!.id;
    const before = JSON.stringify((await import("@/lib/derive")).currentFindings(c).map((f) => [f.id, f.status]));
    const run = await saveAgentRun(c.id, {
      startedAt: new Date().toISOString(),
      model: "gemini-2.5-flash",
      agentVersion: "test",
      steps: [{ node: "load_case", kind: "check", summary: "loaded" }],
      reviewerSummary: [{ text: "The battery figure was written over other text.", findingIds: [claimId] }],
      sellerQuestions: [
        { text: "Can you share the original report?", findingIds: [claimId] },
        { text: "This report is fraudulent, isn't it?", findingIds: [claimId] },
        { text: "Uncited question?", findingIds: [] },
        { text: "Made-up finding?", findingIds: ["claim:nope"] },
      ],
      issuerRequests: [{ text: "Please confirm the SOH.", findingIds: [claimId], documentId: "nope", to: "x", subject: "y" }],
    });
    expect(run.sellerQuestions.map((q) => q.text)).toEqual(["Can you share the original report?"]);
    expect(run.issuerRequests).toEqual([]);
    expect(run.dropped).toHaveLength(4);
    const after = (await getCase(c.id))!;
    expect(after.agentRuns).toHaveLength(1);
    expect(after.events.at(-1)?.type).toBe("agent_run");
    expect(JSON.stringify((await import("@/lib/derive")).currentFindings(after).map((f) => [f.id, f.status]))).toBe(before);
  });

  it("keeps forensic explanations only for indicators the checks raised", async () => {
    const c = (await getCase("demo-tampered-kona"))!;
    const battery = c.documents.find((d) => d.filename === "kona-battery-report.pdf")!;
    const f = (code: string, text = "The visible value sits on top of other text.") => ({ indicatorCode: code, field: "batterySohPercent", whatWasFound: text, whatYouCanSee: "Nothing visible.", howSuchEditsAreMade: "A white box and new text.", innocentExplanations: "Rare.", whatToRequest: "The original report." });
    const run = await saveAgentRun(c.id, {
      startedAt: new Date().toISOString(),
      model: "gemini-2.5-flash",
      agentVersion: "test",
      steps: [{ node: "forensic_analyst", kind: "analysis", model: "gemini-2.5-pro", ms: 21000, summary: "explained" }],
      reviewerSummary: [],
      sellerQuestions: [],
      issuerRequests: [],
      forensicReport: [
        { documentId: battery.id, filename: "x", model: "gemini-2.5-pro", summary: "Changed after issue.", limitations: "Cannot tell who.", findings: [f("text_overlaps_text"), f("jpeg_ghost_mismatch"), f("signature_broken", "This is a forgery.")] },
        { documentId: "nope", filename: "y", model: "gemini-2.5-pro", summary: "s", limitations: "l", findings: [f("text_overlaps_text")] },
      ],
    });
    expect(run.forensicReport).toHaveLength(1);
    expect(run.forensicReport![0].filename).toBe("kona-battery-report.pdf");
    expect(run.forensicReport![0].findings.map((x) => x.indicatorCode)).toEqual(["text_overlaps_text"]);
    expect(run.dropped).toHaveLength(3);
  });

  it("rejects malformed runs", async () => {
    await expect(saveAgentRun("demo-hero-id3", { steps: "lots" })).rejects.toThrow(/Invalid agent run/);
  });
});
