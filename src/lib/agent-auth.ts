// Service-to-service auth for the ADK agent (agent-service/). The agent calls a
// small allowlist of API routes with a shared secret from Secret Manager; it
// never gets a session, and it is recorded as "VoltProof agent" in the audit trail.
// Runs in middleware (edge) and route handlers, so no Node-only APIs here.
export const AGENT_ACTOR = "VoltProof agent";

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** True when the request carries the agent's bearer token (and one is configured, ≥ 32 chars). */
export function isAgentRequest(req: Request | { headers: Headers }) {
  const token = process.env.AGENT_API_TOKEN ?? "";
  if (token.length < 32) return false;
  const h = req.headers.get("authorization") ?? "";
  return h.startsWith("Bearer ") && constantTimeEqual(h.slice(7), token);
}

/** API paths the agent may call. It can read a case and its files, run reference checks, re-check a document and store its run. */
export const AGENT_ROUTES: { method: string; pattern: RegExp }[] = [
  { method: "GET", pattern: /^\/api\/cases\/[\w-]+\/agent-view$/ },
  // Read a document's file, so the forensic analyst model can look at a flagged document.
  { method: "GET", pattern: /^\/api\/cases\/[\w-]+\/documents\/[\w-]+\/file$/ },
  { method: "POST", pattern: /^\/api\/cases\/[\w-]+\/registry$/ },
  { method: "POST", pattern: /^\/api\/cases\/[\w-]+\/documents\/[\w-]+\/process$/ },
  { method: "POST", pattern: /^\/api\/cases\/[\w-]+\/agent-runs$/ },
];

export function agentMayCall(method: string, pathname: string) {
  return AGENT_ROUTES.some((r) => r.method === method && r.pattern.test(pathname));
}
