import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { addDocument, UserError } from "@/lib/cases";

type Ctx = { params: Promise<{ id: string }> };

/** Multipart upload: one "file" field and its "provenance" per request. */
export const POST = route<Ctx>(async (req, ctx, user) => {
  const { id } = await ctx.params;
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof File)) throw new UserError("noFile");
  const doc = await addDocument(id, { name: file.name, data: Buffer.from(await file.arrayBuffer()) }, String(form.get("provenance") ?? "unknown"), user);
  return NextResponse.json({ id: doc.id, filename: doc.filename });
});
