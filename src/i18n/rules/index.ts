// The rules' wording in every language. English is the stored record; the others are for display.
import type { Locale } from "../config";
import { en, type RuleText } from "./en";
import { id } from "./id";
import { ko } from "./ko";

export type { RuleText };
export const RULE_TEXT: Record<Locale, RuleText> = { en, id, ko };
