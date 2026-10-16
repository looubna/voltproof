import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { UserError } from "@/lib/cases";
import { MAX_LISTING_CHARS, parseListing } from "@/lib/claims/parse";
import { getConfig } from "@/lib/config";

export const maxDuration = 60;

/** Listing text → proposed claims. Nothing is saved until the reviewer confirms. */
export const POST = route(async (req) => {
  const body = (await req.json().catch(() => ({}))) as { text?: unknown };
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (text.length < 5) throw new UserError("Paste the seller's listing or message first.");
  if (text.length > MAX_LISTING_CHARS) throw new UserError(`The text is too long (${MAX_LISTING_CHARS.toLocaleString("en-US")} characters max).`);
  return NextResponse.json(await parseListing(text, getConfig()));
});
