import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { addVerification } from "@/lib/cases";

type Ctx = { params: Promise<{ id: string; docId: string }> };

/** Records a person's check of this document with its issuer or a registry. */
export const POST = route<Ctx>(async (req, ctx, user) => {
  const { id, docId } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  await addVerification(id, docId, body, user);
  return NextResponse.json({ ok: true });
});
