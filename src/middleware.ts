import { NextResponse, type NextRequest } from "next/server";
import { agentMayCall, isAgentRequest } from "./lib/agent-auth";
import { SESSION_COOKIE, verifySessionToken } from "./lib/session";

/** Reachable without a session: the landing and sign-in pages, sign-in API, health check and the public leads endpoint (its export is protected). */
function isPublic(pathname: string) {
  return pathname === "/" || pathname === "/login" || pathname.startsWith("/login/") || pathname.startsWith("/api/auth/") || pathname === "/api/health" || pathname === "/api/leads";
}

/**
 * Nonce-based policy: Next.js adds the nonce to its own inline scripts, and
 * 'strict-dynamic' lets those load the app's chunks. Inline styles stay allowed
 * because React style props and Next's font CSS use them.
 */
function contentSecurityPolicy(nonce: string) {
  const dev = process.env.NODE_ENV !== "production";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join("; ");
}

function next(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/api/")) return NextResponse.next();
  const nonce = btoa(crypto.randomUUID());
  const csp = contentSecurityPolicy(nonce);
  // Next.js reads the nonce from the request's CSP header when it renders the page.
  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return next(req);
  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (session) return next(req);
  // The ADK agent: only its allowlisted API routes, nothing else.
  if (isAgentRequest(req)) {
    return agentMayCall(req.method, pathname) ? NextResponse.next() : NextResponse.json({ error: "Not allowed for the agent." }, { status: 403 });
  }
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(pathname + req.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except static assets, so every page gets its CSP; isPublic() decides what needs a session.
  // Browser icons and the manifest are skipped too: signed-out pages show them, and browsers fetch the
  // manifest without cookies, so behind the session check they would be redirected to the sign-in page.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|apple-icon.png|manifest.webmanifest|icons/).*)"],
};
