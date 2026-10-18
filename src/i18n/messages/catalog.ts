// Every language's messages, for code that is not tied to a request (server libraries, tests).
// Server components use getI18n() from ../server, which picks the request's language.
import type { Locale } from "../config";
import { en, type Messages } from "./en";
import { id } from "./id";
import { ko } from "./ko";

export const MESSAGES: Record<Locale, Messages> = { en, id, ko };
