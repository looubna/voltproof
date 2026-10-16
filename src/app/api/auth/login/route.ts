import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE_S } from "@/lib/session";

function same(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { name?: string; accessCode?: string };
  const name = (body.name ?? "").trim().slice(0, 60);
  if (name.length < 2) return NextResponse.json({ error: "Enter your name (it is recorded with every review)." }, { status: 400 });
  const { accessCode } = getConfig();
  if (accessCode && !same(body.accessCode ?? "", accessCode)) {
    return NextResponse.json({ error: "Incorrect access code." }, { status: 401 });
  }
  let token: string;
  try {
    token = await createSessionToken(name);
  } catch {
    return NextResponse.json({ error: "Sign-in is not configured on this server (SESSION_SECRET missing)." }, { status: 500 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_MAX_AGE_S });
  return res;
}
