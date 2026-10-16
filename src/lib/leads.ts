// Landing page waitlist and demo requests. Public endpoint, so: strict
// validation, a honeypot field, a per-IP rate limit, idempotent storage, and
// the same answer for new and repeat sign-ups (no email enumeration).
import { createHash } from "node:crypto";
import { z } from "zod";
import { getStore } from "./storage";
import type { Lead } from "./types";

const email = z.string().trim().toLowerCase().email("Enter a valid email address.").max(200);
const honeypot = z.string().max(0, "Invalid submission.").optional();

export const leadSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("waitlist"), email, website: honeypot }),
  z.object({
    kind: z.literal("demo"),
    name: z.string().trim().min(1, "Enter your name.").max(100),
    email,
    company: z.string().trim().min(1, "Enter your company.").max(120),
    role: z.enum(["lender", "dealer", "marketplace", "insurer", "fleet", "buyer", "other"], { errorMap: () => ({ message: "Choose your role." }) }),
    volumeRange: z.enum(["1-10", "11-50", "51-200", "200+"]).optional(),
    wantsToVerify: z.string().trim().max(1000).optional(),
    marketingOptIn: z.boolean().default(false),
    website: honeypot,
  }),
]);

export class LeadError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

// ---------------------------------------------------------------- rate limit

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 5;
const hits = new Map<string, number[]>();

/** In-memory sliding window, enough for one Cloud Run instance. Cloud Armor is the production path. */
export function rateLimited(key: string, now = Date.now()) {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 10_000) for (const [k, v] of hits) if (now - v[v.length - 1] > WINDOW_MS) hits.delete(k);
  return recent.length > MAX_PER_WINDOW;
}

export function resetRateLimitForTests() {
  hits.clear();
}

function salt() {
  return process.env.SESSION_SECRET || "voltproof-local-dev-secret";
}

export function hashIp(ip: string) {
  return createHash("sha256").update(`${salt()}:${ip}`).digest("hex").slice(0, 32);
}

export function clientIp(req: Request) {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
}

export async function submitLead(body: unknown, meta: { ip: string; userAgent: string }) {
  const ipHash = hashIp(meta.ip);
  if (rateLimited(ipHash)) throw new LeadError("Too many requests. Please try again in a minute.", 429);
  const parsed = leadSchema.safeParse(body);
  if (!parsed.success) throw new LeadError(parsed.error.issues[0]?.message ?? "Invalid submission.");
  const d = parsed.data;
  const lead: Lead = {
    id: createHash("sha256").update(`${d.kind}:${d.email}`).digest("hex"),
    kind: d.kind,
    email: d.email,
    marketingOptIn: d.kind === "demo" ? d.marketingOptIn : false,
    createdAt: new Date().toISOString(),
    ipHash,
    userAgent: meta.userAgent.slice(0, 200),
    ...(d.kind === "demo" ? { name: d.name, company: d.company, role: d.role, volumeRange: d.volumeRange, wantsToVerify: d.wantsToVerify } : {}),
  };
  const created = await getStore().putLead(lead);
  console.log(JSON.stringify({ severity: "INFO", step: "lead", kind: lead.kind, created }));
  return { ok: true as const };
}
