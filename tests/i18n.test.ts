import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { LOCALES, isLocale, landingPath, switchLandingPath } from "@/i18n/config";
import { errorText } from "@/i18n/errors";
import { format, formatPlural, type Plural } from "@/i18n/format";
import { en } from "@/i18n/messages/en";
import { id } from "@/i18n/messages/id";
import { ko } from "@/i18n/messages/ko";
import { negotiateLocale } from "@/i18n/negotiate";
import { computeFindings, getCase, listCases, UserError } from "@/lib/cases";
import { currentFindings } from "@/lib/derive";
import { eventText, historyEntryIn } from "@/lib/history";
import { findingView, titleTranslator } from "@/lib/localize";
import { SAMPLE_CASES } from "@/lib/samples/definitions";
import { setStore } from "@/lib/storage";
import { LocalStore } from "@/lib/storage/local";

describe("choosing a language from the browser", () => {
  it("picks the best supported language by quality and order", () => {
    expect(negotiateLocale("ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7")).toBe("ko");
    expect(negotiateLocale("id-ID,id;q=0.9,en;q=0.8")).toBe("id");
    expect(negotiateLocale("fr-FR,fr;q=0.9,ko;q=0.5,en;q=0.6")).toBe("en");
    expect(negotiateLocale("en;q=0.5, id;q=0.8")).toBe("id");
    expect(negotiateLocale("EN-gb")).toBe("en");
  });
  it("returns null when nothing usable is offered", () => {
    expect(negotiateLocale(null)).toBeNull();
    expect(negotiateLocale("")).toBeNull();
    expect(negotiateLocale("fr-FR, de;q=0.8")).toBeNull();
    expect(negotiateLocale("ko;q=0")).toBeNull();
    expect(negotiateLocale("*")).toBeNull();
  });
});

describe("message formatting", () => {
  it("fills placeholders and leaves unknown ones visible", () => {
    expect(format("Opened {date}", { date: "1 Oct" })).toBe("Opened 1 Oct");
    expect(format("Hi {name}")).toBe("Hi {name}");
  });
  it("uses each language's plural rules", () => {
    expect(formatPlural("en", en.dashboard.list.count, 1)).toBe("1 case");
    expect(formatPlural("en", en.dashboard.list.count, 5)).toBe("5 cases");
    expect(formatPlural("en", en.dashboard.list.countFiltered, 12, { shown: 3 })).toBe("3 of 12 cases");
    expect(formatPlural("id", id.dashboard.list.count, 1)).toBe("1 kasus");
    expect(formatPlural("ko", ko.dashboard.list.count, 2)).toBe("케이스 2건");
    expect(formatPlural("en", en.dashboard.list.documents, 1200)).toBe("1,200 documents");
  });
});

describe("landing page URLs", () => {
  it("has one URL per language, with English at the root", () => {
    expect(LOCALES.map(landingPath)).toEqual(["/", "/id", "/ko"]);
    expect(switchLandingPath("en")).toBe("/en");
    expect(switchLandingPath("ko")).toBe("/ko");
    expect(isLocale("ko")).toBe(true);
    expect(isLocale("fr")).toBe(false);
  });
});

/** Every message as [path, value]; plural messages expand per form ("path.one", "path.other"). */
function entries(obj: unknown, path = ""): [string, string][] {
  if (typeof obj === "string") return [[path, obj]];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) => entries(v, path ? `${path}.${k}` : k));
}
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const isPlural = (v: unknown): v is Plural => !!v && typeof v === "object" && "other" in (v as object) && Object.keys(v as object).every((k) => ["zero", "one", "two", "few", "many", "other"].includes(k));

describe("translations", () => {
  const source = new Map(entries(en));

  it.each([
    ["id", id],
    ["ko", ko],
  ])("%s keeps every placeholder of the English message and leaves nothing empty", (_name, messages) => {
    for (const [path, value] of entries(messages)) {
      expect(value.trim(), path).not.toBe("");
      // A plural form is compared with the English "other" form (languages differ in which forms they need).
      const english = source.get(path) ?? source.get(path.replace(/\.(zero|one|two|few|many)$/, ".other"));
      expect(english, `${path} has no English source`).toBeDefined();
      expect(placeholders(value), path).toEqual(placeholders(english!));
    }
  });

  it("gives every plural message an 'other' form in every language", () => {
    const walk = (a: unknown, b: unknown, path: string) => {
      if (isPlural(a)) return expect(isPlural(b) && typeof b.other === "string", path).toBe(true);
      if (a && typeof a === "object") for (const k of Object.keys(a)) walk((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`);
    };
    walk(en, id, "id");
    walk(en, ko, "ko");
  });
});

describe("server errors", () => {
  it("are worded in the requester's language, with values filled in", () => {
    expect(errorText("fileTooLarge", "en", { file: "a.pdf", mb: 25 })).toBe("a.pdf is larger than 25 MB.");
    expect(errorText("noteTooLong", "en", { max: 2000 })).toBe("The note is too long (2,000 characters max).");
    expect(errorText("noteTooLong", "id", { max: 2000 })).toBe("Catatannya terlalu panjang (maksimal 2.000 karakter).");
    expect(errorText("duplicateVin", "en", { count: 1 })).toMatch(/^A case already exists/);
    expect(errorText("duplicateVin", "ko", { count: 3 })).toMatch(/케이스 3건/);
  });
  it("keep the English text as the error's message, for logs", () => {
    const e = new UserError("caseNotFound", { status: 404 });
    expect([e.message, e.code, e.status]).toEqual(["Case not found.", "caseNotFound", 404]);
  });
});

describe("findings in the reader's language", () => {
  beforeAll(async () => {
    delete process.env.VOLTPROOF_AI_MODE;
    setStore(new LocalStore(await mkdtemp(path.join(os.tmpdir(), "voltproof-i18n-"))));
    await listCases();
  });

  it("re-running the rules in English reproduces the stored record exactly", async () => {
    for (const sc of SAMPLE_CASES) {
      const c = (await getCase(sc.id))!;
      expect(computeFindings(c)).toEqual(currentFindings(c));
    }
  });

  it.each(["id", "ko"] as const)("shows every demo finding and history entry in %s", async (locale) => {
    for (const sc of SAMPLE_CASES) {
      const c = (await getCase(sc.id))!;
      const view = findingView(c, locale);
      for (const f of currentFindings(c)) {
        const s = view(f);
        // Same decision, other words.
        expect({ id: f.id, lang: s.lang, status: s.status, evidence: s.evidence.length }).toEqual({ id: f.id, lang: locale, status: f.status, evidence: f.evidence.length });
        const text = [s.title, s.checked, s.result, s.whyItMatters, s.nextAction ?? "", s.claim?.label ?? "", s.claim?.headline ?? "", s.claim?.missing ?? "", ...s.evidence.flatMap((e) => [e.documentName, e.field, e.value])];
        expect(text.join("\n"), f.id).not.toMatch(/undefined|NaN|\{\w+\}/);
        expect(s.title, f.id).not.toBe(f.title);
      }
      const title = titleTranslator(c, view);
      for (const e of c.events) expect({ type: e.type, lang: historyEntryIn(e, locale, title).lang }).toEqual({ type: e.type, lang: undefined });
    }
  });

  it("keeps values from documents as they are", async () => {
    const c = (await getCase("demo-hero-id3"))!;
    const stored = currentFindings(c).find((f) => f.id === "claim:demo-hero-id3-claim-3")!;
    const shown = findingView(c, "ko")(stored);
    expect(shown.result).toContain("rear bumper and tailgate replaced after a low-speed rear collision");
    expect(shown.evidence.map((e) => e.value)).toEqual(stored.evidence.map((e) => e.value));
  });

  it("shows the stored English when the record no longer matches the rules", async () => {
    const c = structuredClone((await getCase("demo-kia-ev6"))!);
    const f = c.ruleRuns.at(-1)!.findings.find((x) => x.id === "vin-consistency")!;
    f.result = "An older wording of this result.";
    const shown = findingView(c, "id")(f);
    expect([shown.lang, shown.result]).toEqual(["en", "An older wording of this result."]);
  });
});

describe("case history", () => {
  const event = (type: string, detail: string) => ({ at: "2026-10-01T00:00:00Z", actor: "Sam", type, detail });
  it("words older English-only events in the reader's language", () => {
    expect(historyEntryIn(event("claim_added", "Seller claim recorded: Battery health (“battery 92%”)."), "id").text).toBe("Klaim penjual dicatat: Kesehatan baterai (“battery 92%”).");
    expect(historyEntryIn(event("rules_run", "Rules 2026.10.3 ran (claims updated): 1 conflict, 5 consistent."), "ko").text).toBe("검사 갱신(주장 갱신): 충돌 1건, 일치 5건.");
  });
  it("keeps what an outside service said in English, marked as such", () => {
    const e = historyEntryIn(event("registry_check", "NHTSA vPIC: 2021 TESLA Model 3"), "ko");
    expect([e.text, e.lang]).toEqual(["NHTSA vPIC: 2021 TESLA Model 3", "en"]);
  });
  it("stores new events with their values, worded in English for the record", () => {
    expect(eventText("document_extracted", { file: "a.pdf", outcome: "read", edits: 2 }, "en")).toBe("a.pdf was read and checked. 2 possible signs of editing found.");
    expect(eventText("document_extracted", { file: "a.pdf", outcome: "read", edits: 2 }, "id")).toBe("a.pdf sudah dibaca dan diperiksa. Ditemukan 2 kemungkinan tanda penyuntingan.");
  });
});
