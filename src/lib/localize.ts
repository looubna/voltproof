// Shows a case's stored findings in the reader's language. Server only.
//
// Findings are stored in English: they are the audit record that reviews, the report and the
// evidence agent refer to. To show them in another language, the same deterministic rules run
// again on the same case with that language's wording (src/i18n/rules). The translation is used
// only when the English re-run reproduces the stored finding exactly, so what a reader sees
// always says what the record says. Otherwise (rules updated since, settings changed) the
// stored English is shown, marked as English.
//
// Statuses, review state and every other decision come from the stored findings; only the
// words change. Values from documents and outside services are not translated.
import type { Locale } from "../i18n/config";
import { RULE_TEXT } from "../i18n/rules";
import { computeFindings } from "./cases";
import { currentFindings } from "./derive";
import type { Case, EvidenceRef, Finding } from "./types";

export interface ShownEvidence extends EvidenceRef {
  /** A value set aside or a date problem: shown in the warning colour. */
  warn: boolean;
  /** The value was not used by the check. */
  excluded: boolean;
  /** "en" when the note is a check's own English message (it describes and quotes the file), shown as written. */
  noteLang?: Locale;
}

export interface ShownFinding extends Omit<Finding, "evidence"> {
  evidence: ShownEvidence[];
  /** The language the words are in: the reader's, or English when they could not be re-worded. */
  lang: Locale;
}

export type FindingView = (f: Finding) => ShownFinding;

// Read from the stored English note, so they hold in every language.
const WARN = /^(Not |Invalid|Date is in the future|Earlier than)/;
const EXCLUDED = /^Not used/;

function shownEvidence(shown: EvidenceRef, stored: EvidenceRef, reworded: boolean): ShownEvidence {
  const note = stored.note ?? "";
  // A re-worded finding whose note came out the same was not VoltProof's own wording.
  const untranslated = reworded && !!note && shown.note === note;
  return { ...shown, warn: WARN.test(note), excluded: EXCLUDED.test(note), ...(untranslated ? { noteLang: "en" as const } : {}) };
}

/** Everything a finding says, to tell whether a re-run says the same as the record. */
function wording(f: Finding) {
  return JSON.stringify([f.status, f.title, f.checked, f.result, f.whyItMatters, f.nextAction, f.evidence, f.claim?.label, f.claim?.headline, f.claim?.missing]);
}

function asStored(f: Finding): ShownFinding {
  return { ...f, evidence: f.evidence.map((e) => shownEvidence(e, e, false)), lang: "en" };
}

/**
 * A function that shows a stored finding of this case in `locale`. Decide with the stored
 * finding (status, review state); display what this returns.
 */
export function findingView(c: Case, locale: Locale): FindingView {
  if (locale === "en" || !currentFindings(c).length) return asStored;
  let english: Map<string, Finding>;
  let local: Map<string, Finding>;
  try {
    english = new Map(computeFindings(c, RULE_TEXT.en).map((f) => [f.id, f]));
    local = new Map(computeFindings(c, RULE_TEXT[locale]).map((f) => [f.id, f]));
  } catch (e) {
    console.error(e);
    return asStored;
  }
  const cache = new Map<string, ShownFinding>();
  return (f) => {
    const hit = cache.get(f.id);
    if (hit) return hit;
    const e = english.get(f.id);
    const l = local.get(f.id);
    const same = !!e && !!l && wording(e) === wording(f) && l.evidence.length === f.evidence.length;
    const shown: ShownFinding = same
      ? {
          ...f,
          title: l!.title,
          checked: l!.checked,
          result: l!.result,
          whyItMatters: l!.whyItMatters,
          nextAction: l!.nextAction,
          evidence: f.evidence.map((s, i) => shownEvidence(l!.evidence[i], s, true)),
          claim: f.claim && l!.claim ? { ...f.claim, label: l!.claim.label, headline: l!.claim.headline, missing: l!.claim.missing } : f.claim,
          lang: locale,
        }
      : asStored(f);
    cache.set(f.id, shown);
    return shown;
  };
}

/** A finding's title in the reader's language, from its stored English title (for the history and old reviews). */
export function titleTranslator(c: Case, view: FindingView): (english: string) => string {
  const titles = new Map(currentFindings(c).map((f) => [f.title, view(f).title]));
  return (english) => titles.get(english) ?? english;
}
