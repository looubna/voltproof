import { Suspense } from "react";
import { LoginForm } from "@/components/client";
import { LogoMark } from "@/components/logo";
import { getConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  const { accessCode } = getConfig();
  return (
    <div className="mx-auto mt-10 max-w-md">
      <div className="mb-6 text-center">
        {/* Light page, so the mark alone; the heading below carries the name. */}
        <LogoMark size={48} priority className="mx-auto mb-3" />
        <h1 className="text-2xl font-semibold tracking-tight">VoltProof</h1>
        <p className="mt-1 text-sm text-muted">Evidence review for used electric vehicles</p>
      </div>
      <div className="card p-6">
        <Suspense>
          <LoginForm needsCode={!!accessCode} />
        </Suspense>
        {!accessCode && (
          <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Open access: no access code is configured. Set <code>VOLTPROOF_ACCESS_CODE</code> before deploying.
          </p>
        )}
      </div>
      <p className="mt-4 text-center text-xs text-muted">Gemini reads. Rules decide. People resolve.</p>
    </div>
  );
}
