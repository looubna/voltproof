import { NextResponse } from "next/server";
import { agentView } from "@/lib/agent";
import { route } from "@/lib/api";
import { getCase } from "@/lib/cases";

type Ctx = { params: Promise<{ id: string }> };

/** Read-only case picture for the ADK evidence agent. */
export const GET = route<Ctx>(async (_req, ctx) => {
  const { id } = await ctx.params;
  const c = await getCase(id);
  if (!c) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json(agentView(c));
});
