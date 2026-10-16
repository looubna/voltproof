import { getConfig } from "@/lib/config";
import { ASSESSOR_VERSION } from "@/lib/claims/assess";
import { RULES_VERSION } from "@/lib/rules";

export const dynamic = "force-dynamic";

/** Public status: shows whether Gemini and Google Cloud storage are live. No secrets. */
export function GET() {
  const cfg = getConfig();
  return Response.json({
    ok: true,
    aiMode: cfg.aiMode,
    geminiModel: cfg.aiMode === "vertex" ? cfg.geminiModel : null,
    storage: cfg.storage,
    rulesVersion: RULES_VERSION,
    assessorVersion: ASSESSOR_VERSION,
    revision: process.env.K_REVISION ?? process.env.GIT_COMMIT ?? "local",
  });
}
