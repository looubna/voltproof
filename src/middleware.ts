import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_LOCALE, LOCALE_COOKIE, LOCALE_COOKIE_OPTIONS, PATH_LOCALE_HEADER, isLocale, landingPath, type Locale } from "./i18n/config";
import { negotiateLocale } from "./i18n/negotiate";
import { agentMayCall, isAgentRequest } from "./lib/agent-auth";
import { SESSION_COOKIE, verifySessionToken } from "./lib/session";

/** The landing page's language versions: "/" is English, then one path per other language. */
const LANDING: Record<string, Locale> = { "/": "en", "/id": "id", "/ko": "ko" };

/** Reachable without a session: the landing page (every language), sign-in, its API, health check and the public leads endpoint (its export is protected). */
function isPublic(pathname: string) {
  return (
    Object.hasOwn(LANDING, pathname) ||
    pathname === `/${DEFAULT_LOCALE}` ||
    pathname === "/login" ||
    pathname.startsWith("/login/") ||
    pathname.startsWith("/api/auth/") ||
    pathname === "/api/health" ||
    pathname === "/api/leads"
  );
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

/** Lets the request through, adding the CSP to pages and, on the landing page, the URL's language. */
function next(req: NextRequest, pathLocale?: Locale) {
  if (req.nextUrl.pathname.startsWith("/api/")) return NextResponse.next();
  const nonce = btoa(crypto.randomUUID());
  const csp = contentSecurityPolicy(nonce);
  // Next.js reads the nonce from the request's CSP header when it renders the page.
  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  // Only the middleware decides the URL's language: never trust one sent by the client.
  headers.delete(PATH_LOCALE_HEADER);
  if (pathLocale) headers.set(PATH_LOCALE_HEADER, pathLocale);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

function redirectTo(req: NextRequest, pathname: string) {
  const url = req.nextUrl.clone();
  url.pathname = pathname;
  return NextResponse.redirect(url);
}

/**
 * Language routing for the public landing page, which has one URL per language
 * (so each version can be indexed and shared). Null for every other path.
 */
function landing(req: NextRequest): NextResponse | null {
  const { pathname } = req.nextUrl;
  const saved = req.cookies.get(LOCALE_COOKIE)?.value;

  // The language switcher's English link: remember the choice, then show "/".
  // (A plain link to "/" would send someone who chose Korean earlier straight back to "/ko".)
  if (pathname === `/${DEFAULT_LOCALE}`) {
    const res = redirectTo(req, landingPath(DEFAULT_LOCALE));
    res.cookies.set(LOCALE_COOKIE, DEFAULT_LOCALE, LOCALE_COOKIE_OPTIONS);
    return res;
  }

  const pathLocale = Object.hasOwn(LANDING, pathname) ? LANDING[pathname] : undefined;
  if (!pathLocale) return null;

  if (pathLocale === DEFAULT_LOCALE) {
    // "/": show the language chosen before or, on a first visit, the browser's preferred one.
    // Only for page loads: a redirect would break a form post or Server Action to "/".
    if (req.method === "GET" || req.method === "HEAD") {
      const preferred = isLocale(saved) ? saved : negotiateLocale(req.headers.get("accept-language"));
      if (preferred && preferred !== DEFAULT_LOCALE) {
        const res = redirectTo(req, landingPath(preferred));
        res.headers.set("Vary", "Accept-Language, Cookie");
        return res;
      }
    }
    const res = next(req, pathLocale);
    res.headers.set("Vary", "Accept-Language, Cookie");
    return res;
  }

  // "/id", "/ko": following a link to a language version is a choice; remember it for the app too.
  const res = next(req, pathLocale);
  if (saved !== pathLocale) res.cookies.set(LOCALE_COOKIE, pathLocale, LOCALE_COOKIE_OPTIONS);
  return res;
}

export async function middleware(req: NextRequest) {
  const localized = landing(req);
  if (localized) return localized;

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
