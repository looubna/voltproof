import { Suspense } from "react";
import { LoginForm } from "@/components/client";
import { getConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  const { accessCode } = getConfig();
  return (
    <div className="mx-auto mt-10 max-w-md">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600">
          <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden>
            <path d="M17.5 5 9 18h6l-1.5 9L23 13.5h-6.2z" fill="#fff" />
          </svg>
        </div>
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
