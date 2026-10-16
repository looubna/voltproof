import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { processDocument } from "@/lib/cases";

type Ctx = { params: Promise<{ id: string; docId: string }> };

export const maxDuration = 120;

export const POST = route<Ctx>(async (_req, ctx, user) => {
  const { id, docId } = await ctx.params;
  const c = await processDocument(id, docId, user);
  const d = c.documents.find((x) => x.id === docId)!;
  return NextResponse.json({ status: d.extractionStatus, error: d.extractionError, mode: d.extraction?.mode ?? null });
});
