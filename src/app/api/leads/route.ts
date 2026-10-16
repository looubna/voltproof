import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { clientIp, LeadError, submitLead } from "@/lib/leads";

// Public: the landing page posts here without signing in.
function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  const allowed = getConfig().landingOrigin;
  if (!origin || !allowed || origin !== allowed) return {};
  return { "Access-Control-Allow-Origin": allowed, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", Vary: "Origin" };
}

export function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: cors(req) });
}

export async function POST(req: Request) {
  const headers = cors(req);
  try {
    const body = await req.json().catch(() => null);
    const result = await submitLead(body, { ip: clientIp(req), userAgent: req.headers.get("user-agent") ?? "" });
    return NextResponse.json(result, { headers });
  } catch (e) {
    if (e instanceof LeadError) return NextResponse.json({ error: e.message }, { status: e.status, headers });
    console.error(e);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500, headers });
  }
}
