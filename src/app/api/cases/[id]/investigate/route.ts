import { NextResponse } from "next/server";
import { requestInvestigation } from "@/lib/agent";
import { route } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

export const maxDuration = 180;

/** "Run evidence agent": a reviewer asks the ADK agent to investigate this case. */
export const POST = route<Ctx>(async (_req, ctx, user) => {
  const { id } = await ctx.params;
  return NextResponse.json(await requestInvestigation(id, user));
});
