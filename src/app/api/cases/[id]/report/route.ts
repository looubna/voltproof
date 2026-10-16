import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { getCase } from "@/lib/cases";
import { buildReport } from "@/lib/report";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (_req, ctx, user) => {
  const { id } = await ctx.params;
  const c = await getCase(id);
  if (!c) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return new Response(JSON.stringify(buildReport(c, user), null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="voltproof-${c.caseNumber}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
});
