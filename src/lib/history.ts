// The case history in plain words. An event stores what happened as a type and values
// (`params`) with an English `detail` for the record; eventText() words it in any language.
// Events written before `params` existed are read back from their English text, and the
// oldest wordings are first brought up to date by historyEntry(), so older cases read the same.
import type { Locale } from "../i18n/config";
import { format, formatPlural } from "../i18n/format";
import { MESSAGES } from "../i18n/messages/catalog";
import { RULE_TEXT } from "../i18n/rules";
import type { AuditEvent, Status } from "./types";

export type EventParams = Record<string, string | number>;

export interface HistoryEntry {
  at: string;
  who: string;
  text: string;
  /** Model names, versions, hashes: shown with "Technical details" on. */
  technical?: string;
  /** Automatic re-runs of the checks, as opposed to something a person or the agent did. */
  automatic: boolean;
  /** Set when the text could not be worded in the reader's language and is shown in English. */
  lang?: Locale;
}

/** Actors VoltProof names itself, by message key. People's names are shown as entered. */
const WHO_KEY: Record<string, "system" | "seed" | "agent"> = {
  system: "system",
  "VoltProof demo seed": "seed",
  "VoltProof agent": "agent",
};

const WHO: Record<string, string> = {
  system: MESSAGES.en.history.who.system,
  "VoltProof demo seed": MESSAGES.en.history.who.seed,
};

/** How the record's own actors ("VoltProof demo seed", "system", the agent) read inside a sentence; people's names as entered. */
export function actorName(actor: string, locale: Locale): string {
  const m = MESSAGES[locale];
  if (actor === "VoltProof demo seed") return m.overview.vehicle.demoSetup;
  const key = WHO_KEY[actor];
  return key ? m.history.who[key] : actor;
}

/** Legacy "2 conflict, 5 consistent" → "2 conflicts, 5 consistent". */
const plainCounts = (counts: string) => counts.replace(/\b(\d+) conflict\b/g, (_, n: string) => `${n} conflict${n === "1" ? "" : "s"}`);

/** An entry in English, the language events are stored in. */
export function historyEntry(e: AuditEvent): HistoryEntry {
  const base = { at: e.at, who: WHO[e.actor] ?? e.actor, automatic: e.type === "rules_run" };
  if (e.technical !== undefined) return { ...base, text: e.detail, technical: e.technical };
  let m: RegExpExecArray | null;

  if (e.type === "rules_run" && (m = /^Rules (\S+) ran \((.*)\): (.*)\.$/.exec(e.detail))) {
    return { ...base, text: `Checks updated (${m[2]}): ${plainCounts(m[3])}.`, technical: `Rules ${m[1]}` };
  }
  if (e.type === "document_added") {
    if ((m = /^(.*) uploaded \((.*?)\); SHA-256 ([0-9a-f]+…)(?: — identical to (.*) already on file)?\.$/.exec(e.detail))) {
      return { ...base, text: `${m[1]} uploaded (${m[2]}).${m[4] ? ` It is identical to ${m[4]}, already on file.` : ""}`, technical: `SHA-256 ${m[3]}` };
    }
    if ((m = /^(.*) added; extraction loaded from demo fixture \(no live AI call\)\.$/.exec(e.detail))) {
      return { ...base, text: `${m[1]} added (sample document; its values come with the demo, not from AI).`, technical: "Extraction loaded from a hand-written demo fixture." };
    }
  }
  if (e.type === "document_extracted" && (m = /^(.+?): ([\s\S]*)$/.exec(e.detail))) {
    const rest = m[2];
    const outcome = /^(Read by|Matched synthetic)/.test(rest) ? "was read and checked." : /^Not read/.test(rest) ? "was stored but not read." : /^Extraction failed/.test(rest) ? "could not be read. Try again, or check it yourself." : null;
    if (outcome) {
      const found = /Forensic checks found (\d+) possible sign/.exec(rest);
      return {
        ...base,
        text: `${m[1]} ${outcome}${found ? ` ${found[1]} possible sign${found[1] === "1" ? "" : "s"} of editing found.` : ""}`,
        technical: rest.replace(/\s*Forensic checks found.*$/, ""),
      };
    }
  }
  if (e.type === "agent_run" && (m = /^Evidence agent ran \((.*?)\): (\d+) steps, (\d+) seller question\(s\) and (\d+) issuer request\(s\) drafted for review\. Nothing was sent\.$/.exec(e.detail))) {
    return { ...base, text: `Evidence agent drafted ${m[3]} question(s) for the seller and ${m[4]} request(s) to document issuers for you to review. Nothing was sent.`, technical: `${m[1]}, ${m[2]} steps` };
  }
  if (e.type === "case_reset" && e.detail.startsWith("Synthetic case reset")) return { ...base, text: "Demo case reset to its original state." };
  return { ...base, text: e.detail };
}

// ---------------------------------------------------------------- wording events

/** Why the checks ran again, as stored with a rule run and in a "Checks updated" event. */
export type Trigger =
  | { trigger: "demoSeed" | "caseCreated" | "claimsUpdated" }
  | { trigger: "sourceChanged" | "documentProcessed" | "verification"; file: string }
  | { trigger: "registry"; provider: string };

const COUNTED: Status[] = ["conflict", "unknown", "consistent", "verified"];

export function triggerText(p: EventParams, locale: Locale): string | null {
  const t = MESSAGES[locale].history.trigger;
  switch (p.trigger) {
    case "demoSeed":
      return t.demoSeed;
    case "caseCreated":
      return t.caseCreated;
    case "claimsUpdated":
      return t.claimsUpdated;
    case "sourceChanged":
      return format(t.sourceChanged, { file: String(p.file) });
    case "documentProcessed":
      return format(t.documentProcessed, { file: String(p.file) });
    case "verification":
      return format(t.verification, { file: String(p.file) });
    case "registry":
      return format(t.registry, { provider: String(p.provider) });
    default:
      return null;
  }
}

/** Counts of findings by status, for a "Checks updated" event. */
export function statusParams(findings: { status: Status }[]): EventParams {
  return Object.fromEntries(COUNTED.map((s) => [s, findings.filter((f) => f.status === s).length]));
}

/**
 * An event in a language, or null when it cannot be worded from its values. `title` turns a
 * finding's stored English title into the reader's language, where the page can.
 */
export function eventText(type: string, p: EventParams, locale: Locale, title: (english: string) => string = (x) => x): string | null {
  const m = MESSAGES[locale];
  const h = m.history;
  const s = (k: string) => String(p[k] ?? "");
  const count = (forms: Parameters<typeof formatPlural>[1], n: number) => formatPlural(locale, forms, n);
  switch (type) {
    case "case_created":
      if (p.demo) return h.demoCreated;
      return format(h.caseCreated, {
        vehicle: s("vehicle"),
        details: (p.vin ? format(h.vinDetail, { vin: s("vin") }) : "") + (p.reference ? format(h.referenceDetail, { reference: s("reference") }) : ""),
      });
    case "document_added": {
      if (p.sample) return format(h.documentSample, { file: s("file") });
      const source = (m.labels.provenance as Record<string, string>)[s("source")];
      if (!source) return null;
      return format(h.documentUploaded, { file: s("file"), source: source.toLowerCase() }) + (p.duplicateOf ? format(h.documentDuplicate, { other: s("duplicateOf") }) : "");
    }
    case "document_extracted": {
      const outcome = ({ read: h.documentRead, not_read: h.documentNotRead, stored: h.documentStored, failed: h.documentFailed } as Record<string, string>)[s("outcome")];
      if (!outcome) return null;
      return format(outcome, { file: s("file") }) + (Number(p.edits) ? count(h.editSigns, Number(p.edits)) : "");
    }
    case "document_source_changed": {
      const labels = m.labels.provenance as Record<string, string>;
      if (!labels[s("from")] || !labels[s("to")]) return null;
      return format(h.sourceChanged, { file: s("file"), from: labels[s("from")], to: labels[s("to")] });
    }
    case "reference_changed":
      return p.reference ? format(h.referenceSet, { reference: s("reference") }) : h.referenceRemoved;
    case "case_archived":
      return h.archived;
    case "case_restored":
      return h.restored;
    case "rules_run": {
      const trigger = triggerText(p, locale);
      if (trigger === null) return null;
      const counts = COUNTED.filter((k) => Number(p[k])).map((k) => count(h.counts[k], Number(p[k])));
      return format(h.checksUpdated, { trigger, counts: counts.join(", ") || h.noFindings });
    }
    case "review_recorded": {
      const resolution = (m.labels.resolution as Record<string, string>)[s("resolution")];
      const status = (m.status as Record<string, string>)[s("status")];
      if (!resolution || !status) return null;
      return format(h.reviewRecorded, { title: title(s("title")), resolution, status });
    }
    case "claim_added":
    case "claim_withdrawn": {
      const claimType = (m.labels.claimType as Record<string, string>)[s("type")];
      if (!claimType) return null;
      if (type === "claim_withdrawn") return format(h.claimWithdrawn, { type: claimType });
      return p.source ? format(h.claimAddedFrom, { type: claimType, source: s("source") }) : format(h.claimAdded, { type: claimType });
    }
    case "issuer_verification": {
      const outcome = (h.verification as Record<string, string>)[s("outcome")];
      if (!outcome) return null;
      return format(outcome, {
        file: s("file"),
        contact: s("contact"),
        method: RULE_TEXT[locale].verificationMethod(s("method")),
        reference: p.reference ? format(h.verificationReference, { reference: s("reference") }) : "",
      });
    }
    case "case_reset":
      return h.caseReset;
    case "agent_run":
      return format(h.agentRun, { questions: count(h.agentQuestions, Number(p.questions)), requests: count(h.agentRequests, Number(p.requests)) });
    default:
      return null;
  }
}

// ---------------------------------------------------------------- reading older events

const en = MESSAGES.en;
/** English label → key, for reading values back out of older English text. */
const keyOf = (labels: Record<string, string>, label: string, lower = false) => Object.keys(labels).find((k) => (lower ? labels[k].toLowerCase() : labels[k]) === label);

/** Values without the ones a pattern did not capture. */
const compact = (o: Record<string, string | number | null | undefined>): EventParams =>
  Object.fromEntries(Object.entries(o).filter((e): e is [string, string | number] => e[1] !== undefined && e[1] !== null));

/** "document processed: invoice.pdf" → { trigger: "documentProcessed", file: "invoice.pdf" }. */
function readTrigger(text: string): EventParams | null {
  const fixed: Record<string, string> = { "demo seed": "demoSeed", "case created": "caseCreated", "claims updated": "claimsUpdated" };
  if (fixed[text]) return { trigger: fixed[text] };
  const withFile: [string, string][] = [
    ["document source changed: ", "sourceChanged"],
    ["document processed: ", "documentProcessed"],
    ["issuer verification: ", "verification"],
  ];
  for (const [prefix, trigger] of withFile) if (text.startsWith(prefix)) return { trigger, file: text.slice(prefix.length) };
  if (text.endsWith(" checked")) return { trigger: "registry", provider: text.slice(0, -" checked".length) };
  return null;
}

const PARSE: Record<string, (text: string) => EventParams | null> = {
  case_created: (t) => {
    if (t === en.history.demoCreated) return { demo: 1 };
    const x = /^Case created for (.*?)(?:, VIN ([A-Z0-9]+))?(?: \((.*)\))?\.$/.exec(t);
    return x ? compact({ vehicle: x[1], vin: x[2], reference: x[3] }) : null;
  },
  document_added: (t) => {
    let x = /^(.*) added \(sample document; its values come with the demo, not from AI\)\.$/.exec(t);
    if (x) return { file: x[1], sample: 1 };
    x = /^(.*) uploaded \((.*?)\)\.(?: It is identical to (.*), already on file\.)?$/.exec(t);
    const source = x && keyOf(en.labels.provenance, x[2], true);
    return x && source ? compact({ file: x[1], source, duplicateOf: x[3] }) : null;
  },
  document_extracted: (t) => {
    const x = /^(.*) (was read and checked\.|was stored but not read: demo mode only reads the sample documents\.|was stored but not read\.|could not be read\. Try again, or check it yourself\.)(?: (\d+) possible signs? of editing found\.)?$/.exec(t);
    if (!x) return null;
    const outcome = x[2].startsWith("was read") ? "read" : x[2].includes("demo mode") ? "not_read" : x[2].startsWith("was stored") ? "stored" : "failed";
    return { file: x[1], outcome, edits: Number(x[3] ?? 0) };
  },
  document_source_changed: (t) => {
    const x = /^(.*): source changed from “(.*)” to “(.*)”\.$/.exec(t);
    const from = x && keyOf(en.labels.provenance, x[2]);
    const to = x && keyOf(en.labels.provenance, x[3]);
    return x && from && to ? { file: x[1], from, to } : null;
  },
  reference_changed: (t) => {
    if (t === en.history.referenceRemoved) return {};
    const x = /^Reference set to “(.*)”\.$/.exec(t);
    return x ? compact({ reference: x[1] }) : null;
  },
  case_archived: (t) => (t === en.history.archived ? {} : null),
  case_restored: (t) => (t === en.history.restored ? {} : null),
  rules_run: (t) => {
    const x = /^Checks updated \((.*)\): (.*)\.$/.exec(t);
    const trigger = x && readTrigger(x[1]);
    if (!x || !trigger) return null;
    const counts: EventParams = {};
    if (x[2] !== en.history.noFindings) {
      for (const part of x[2].split(", ")) {
        const c = /^(\d+) (conflicts?|unknown|consistent|verified)$/.exec(part);
        if (!c) return null;
        counts[c[2].replace(/s$/, "")] = Number(c[1]);
      }
    }
    return { ...trigger, ...counts };
  },
  review_recorded: (t) => {
    const x = /^(.*): marked “(.*)”\. The check's own result \((.*)\) is kept\.$/.exec(t);
    const resolution = x && keyOf(en.labels.resolution, x[2]);
    const status = x && keyOf(en.status, x[3]);
    return x && resolution && status ? { title: x[1], resolution, status } : null;
  },
  claim_added: (t) => {
    const x = /^Seller claim recorded: (.*?)(?: \(“(.*)”\))?\.$/.exec(t);
    const type = x && keyOf(en.labels.claimType, x[1]);
    return x && type ? compact({ type, source: x[2] }) : null;
  },
  claim_withdrawn: (t) => {
    const x = /^Seller claim withdrawn: (.*)\.$/.exec(t);
    const type = x && keyOf(en.labels.claimType, x[1]);
    return type ? { type } : null;
  },
  issuer_verification: (t) => {
    const x = /^(.*?): (.*) (confirmed it issued the document|said it did NOT issue the document|did not respond) \((.*?)(?:, ref\. (.*))?\)\.$/.exec(t);
    if (!x) return null;
    const outcome = x[3].startsWith("confirmed") ? "confirmed" : x[3].startsWith("said") ? "denied" : "no_response";
    return compact({ file: x[1], contact: x[2], outcome, method: x[4].replace(/ /g, "_"), reference: x[5] });
  },
  case_reset: (t) => (t === en.history.caseReset ? {} : null),
  agent_run: (t) => {
    const x = /^Evidence agent drafted (\d+) questions?(?:\(s\))? for the seller and (\d+) requests?(?:\(s\))? to document issuers for you to review\. Nothing was sent\.$/.exec(t);
    return x ? { questions: Number(x[1]), requests: Number(x[2]) } : null;
  },
};

/** An event's values: stored with it, or read back from its English text. */
export function eventParams(e: AuditEvent): EventParams | null {
  if (e.params) return e.params;
  return PARSE[e.type]?.(historyEntry(e).text) ?? null;
}

/**
 * An entry in the reader's language. Events that cannot be worded from their values
 * (a lookup's own message, a wording this version does not know) stay in English.
 */
export function historyEntryIn(e: AuditEvent, locale: Locale, title?: (english: string) => string): HistoryEntry {
  const entry = historyEntry(e);
  if (locale === "en") return entry;
  const key = WHO_KEY[e.actor];
  const who = key ? MESSAGES[locale].history.who[key] : e.actor;
  const params = eventParams(e);
  const text = params ? eventText(e.type, params, locale, title) : null;
  return text === null ? { ...entry, who, lang: "en" } : { ...entry, who, text };
}
