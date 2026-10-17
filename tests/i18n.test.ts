import { describe, expect, it } from "vitest";
import { LOCALES, isLocale, landingPath, switchLandingPath } from "@/i18n/config";
import { format, formatPlural, type Plural } from "@/i18n/format";
import { en } from "@/i18n/messages/en";
import { id } from "@/i18n/messages/id";
import { ko } from "@/i18n/messages/ko";
import { negotiateLocale } from "@/i18n/negotiate";

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
