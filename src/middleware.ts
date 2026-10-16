import { NextResponse, type NextRequest } from "next/server";
import { agentMayCall, isAgentRequest } from "./lib/agent-auth";
import { SESSION_COOKIE, verifySessionToken } from "./lib/session";

export async function middleware(req: NextRequest) {
  // The landing page is public.
  if (req.nextUrl.pathname === "/") return NextResponse.next();
  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (session) return NextResponse.next();
  // The ADK agent: only its allowlisted API routes, nothing else.
  if (isAgentRequest(req)) {
    return agentMayCall(req.method, req.nextUrl.pathname) ? NextResponse.next() : NextResponse.json({ error: "Not allowed for the agent." }, { status: 403 });
  }
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except the sign-in page, its API, health check, the public leads
  // endpoint (its export is still protected) and static assets.
  matcher: ["/((?!login|api/auth|api/health|api/leads$|_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
