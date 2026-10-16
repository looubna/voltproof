import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { setCaseArchived } from "@/lib/cases";

type Ctx = { params: Promise<{ id: string }> };

/** Archives (`{ archived: true }`) or restores (`{ archived: false }`) a case. Nothing is deleted. */
export const POST = route<Ctx>(async (req, ctx, user) => {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { archived?: unknown };
  const c = await setCaseArchived(id, body.archived !== false, user);
  return NextResponse.json({ ok: true, archived: !!c.archivedAt });
});
