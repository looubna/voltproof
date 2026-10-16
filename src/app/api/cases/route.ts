import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { createCase } from "@/lib/cases";

export const POST = route(async (req, _ctx, user) => {
  const body = (await req.json().catch(() => ({}))) as Record<string, string>;
  const c = await createCase({ make: body.make ?? "", model: body.model ?? "", year: body.year || null, vin: body.vin ?? "" }, user);
  return NextResponse.json({ id: c.id });
});
