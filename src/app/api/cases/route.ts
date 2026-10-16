import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { createCase, findCasesByVin } from "@/lib/cases";

/** `?vin=…`: existing cases for a VIN, so the new-case form can warn before creating a duplicate. */
export const GET = route(async (req) => {
  const vin = new URL(req.url).searchParams.get("vin") ?? "";
  return NextResponse.json({ cases: vin ? await findCasesByVin(vin) : [] });
});

export const POST = route(async (req, _ctx, user) => {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const c = await createCase(
    { make: str(body.make), model: str(body.model), year: str(body.year) || null, vin: str(body.vin), allowDuplicateVin: body.allowDuplicateVin === true },
    user,
  );
  return NextResponse.json({ id: c.id });
});
