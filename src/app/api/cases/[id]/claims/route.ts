import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { addClaims, getCase, UserError, type ClaimInput } from "@/lib/cases";
import { claimSummaryLine } from "@/lib/claims/assess";
import { currentFindings } from "@/lib/derive";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (_req, ctx) => {
  const { id } = await ctx.params;
  const c = await getCase(id);
  if (!c) throw new UserError("caseNotFound");
  const assessments = currentFindings(c).filter((f) => f.claim);
  return NextResponse.json({ claims: (c.claims ?? []).filter((x) => !x.withdrawn), assessments, summary: claimSummaryLine(assessments) });
});

export const POST = route<Ctx>(async (req, ctx, user) => {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { claims?: ClaimInput[] };
  const c = await addClaims(id, body.claims ?? [], user);
  const assessments = currentFindings(c).filter((f) => f.claim);
  return NextResponse.json({ ok: true, assessments, summary: claimSummaryLine(assessments) });
});
