import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { setCaseReference } from "@/lib/cases";

type Ctx = { params: Promise<{ id: string }> };

/** Edits the case's own label (`{ reference }`, empty to clear). Audited. */
export const PATCH = route<Ctx>(async (req, ctx, user) => {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { reference?: unknown };
  const c = await setCaseReference(id, body.reference ?? "", user);
  return NextResponse.json({ ok: true, reference: c.reference ?? null });
});
