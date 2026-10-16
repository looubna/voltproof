import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { withdrawClaim } from "@/lib/cases";

type Ctx = { params: Promise<{ id: string; claimId: string }> };

export const DELETE = route<Ctx>(async (_req, ctx, user) => {
  const { id, claimId } = await ctx.params;
  await withdrawClaim(id, claimId, user);
  return NextResponse.json({ ok: true });
});
