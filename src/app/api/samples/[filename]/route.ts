import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { readSampleFile } from "@/lib/extraction/demo";
import { SAMPLE_DOCS } from "@/lib/samples/definitions";

type Ctx = { params: Promise<{ filename: string }> };

/** Download a built-in synthetic sample document (for trying the upload flow). */
export const GET = route<Ctx>(async (_req, ctx) => {
  const { filename } = await ctx.params;
  const doc = SAMPLE_DOCS.find((d) => d.filename === filename);
  if (!doc) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const buf = await readSampleFile(doc);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": doc.format === "pdf" ? "application/pdf" : "image/png",
      "Content-Disposition": `attachment; filename="${doc.filename}"`,
    },
  });
});
