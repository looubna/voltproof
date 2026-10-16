import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { getCase } from "@/lib/cases";
import { getStore } from "@/lib/storage";

type Ctx = { params: Promise<{ id: string; docId: string }> };

export const GET = route<Ctx>(async (req, ctx) => {
  const { id, docId } = await ctx.params;
  const c = await getCase(id);
  const d = c?.documents.find((x) => x.id === docId);
  if (!d) return NextResponse.json({ error: "Not found." }, { status: 404 });
  // ?view=heatmap serves the compression-history heat map made by the photo check.
  if (new URL(req.url).searchParams.get("view") === "heatmap") {
    const key = d.forensics?.heatmapKey;
    const png = key ? await getStore().getFile(key) : null;
    if (!png) return NextResponse.json({ error: "No heat map for this document." }, { status: 404 });
    return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  }
  const buf = await getStore().getFile(d.storageKey);
  if (!buf) return NextResponse.json({ error: "File missing from storage." }, { status: 404 });
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": d.mimeType,
      "Content-Disposition": `inline; filename="${d.filename.replace(/[^A-Za-z0-9._-]/g, "_")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
