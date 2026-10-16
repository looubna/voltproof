import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { runRegistryCheck } from "@/lib/cases";

type Ctx = { params: Promise<{ id: string }> };

export const maxDuration = 60;

/** Checks the VIN against NHTSA vPIC or the NZ Motor Vehicle Register and records it as evidence. */
export const POST = route<Ctx>(async (req, ctx, user) => {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { provider?: string };
  const c = await runRegistryCheck(id, body.provider === "nzta_mvr" ? "nzta_mvr" : "nhtsa_vpic", user);
  const last = c.registryChecks![c.registryChecks!.length - 1];
  return NextResponse.json({ outcome: last.outcome, data: last.data, message: last.message });
});
