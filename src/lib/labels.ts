// English labels for code that writes English: the evidence agent's view of a case and the
// forensic checks' own messages. Pages show labels in the reader's language from
// src/i18n/messages, which is also where these English names are defined, so the two cannot drift.
import { en } from "../i18n/messages/en";
import type { DocumentType } from "./types";

export const DOC_TYPE_LABEL: Record<DocumentType, string> = en.labels.docType;

export const FIELD_LABEL: Record<string, string> = en.labels.field;

/** A field label for use mid-sentence: "Odometer" → "odometer", while "VIN" and "DC …" keep their capitals. */
export function fieldLabelInline(name: string): string {
  const label = FIELD_LABEL[name] ?? name;
  return label.replace(/^[A-Z](?=[a-z])/, (c) => c.toLowerCase());
}

/** "a", "a and b", "a, b and c". */
export function joinList(items: string[]): string {
  return items.length <= 2 ? items.join(" and ") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
