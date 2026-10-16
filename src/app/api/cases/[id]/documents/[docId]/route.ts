import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { setDocumentProvenance } from "@/lib/cases";

type Ctx = { params: Promise<{ id: string; docId: string }> };

/** Corrects where a document came from (`{ provenance }`). Audited; the rules re-run. */
export const PATCH = route<Ctx>(async (req, ctx, user) => {
  const { id, docId } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { provenance?: unknown };
  const c = await setDocumentProvenance(id, docId, typeof body.provenance === "string" ? body.provenance : "", user);
  return NextResponse.json({ ok: true, provenance: c.documents.find((d) => d.id === docId)?.provenance });
});
