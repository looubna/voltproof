// The case history in plain words. New events store a plain `detail` and a separate
// `technical` part; events written before that are translated here, so older cases read the same.
import type { AuditEvent } from "./types";

export interface HistoryEntry {
  at: string;
  who: string;
  text: string;
  /** Model names, versions, hashes: shown with "Technical details" on. */
  technical?: string;
  /** Automatic re-runs of the checks, as opposed to something a person or the agent did. */
  automatic: boolean;
}

const WHO: Record<string, string> = {
  system: "VoltProof (automatic)",
  "VoltProof demo seed": "Demo setup",
};

/** Legacy "2 conflict, 5 consistent" → "2 conflicts, 5 consistent". */
const plainCounts = (counts: string) => counts.replace(/\b(\d+) conflict\b/g, (_, n: string) => `${n} conflict${n === "1" ? "" : "s"}`);

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
