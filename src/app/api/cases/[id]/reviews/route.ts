import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { addReview } from "@/lib/cases";

type Ctx = { params: Promise<{ id: string }> };

export const POST = route<Ctx>(async (req, ctx, user) => {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, string>;
  await addReview(id, body.findingId ?? "", { resolution: body.resolution ?? "", note: body.note ?? "" }, user);
  return NextResponse.json({ ok: true });
});
