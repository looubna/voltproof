import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { resetSampleCase } from "@/lib/cases";

type Ctx = { params: Promise<{ id: string }> };

export const POST = route<Ctx>(async (_req, ctx, user) => {
  const { id } = await ctx.params;
  await resetSampleCase(id, user);
  return NextResponse.json({ ok: true });
});
