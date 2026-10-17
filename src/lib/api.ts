import { NextResponse } from "next/server";
import { AGENT_ACTOR, agentMayCall, isAgentRequest } from "./agent-auth";
import { currentUser } from "./auth";
import { UserError } from "./cases";

type Handler<C> = (req: Request, ctx: C, user: string) => Promise<Response>;

/** Auth check + consistent error handling for route handlers. */
export function route<C>(handler: Handler<C>) {
  return async (req: Request, ctx: C) => {
    let user = await currentUser();
    if (!user && isAgentRequest(req) && agentMayCall(req.method, new URL(req.url).pathname)) user = AGENT_ACTOR;
    if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    try {
      return await handler(req, ctx, user);
    } catch (e) {
      if (e instanceof UserError) return NextResponse.json({ error: e.message, ...e.details }, { status: e.status });
      console.error(e);
      return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
    }
  };
}
