import { NextResponse } from "next/server";
import { saveAgentRun } from "@/lib/agent";
import { AGENT_ACTOR } from "@/lib/agent-auth";
import { route } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

/** The ADK agent stores a finished run here. Drafts are re-validated before saving. */
export const POST = route<Ctx>(async (req, ctx, user) => {
  if (user !== AGENT_ACTOR) return NextResponse.json({ error: "Only the evidence agent can store runs." }, { status: 403 });
  const { id } = await ctx.params;
  const run = await saveAgentRun(id, await req.json().catch(() => null));
  return NextResponse.json({ ok: true, id: run.id, dropped: run.dropped.length });
});
