// App shell: header and container for every signed-in page (and the sign-in page).
import Link from "next/link";
import { SignOutButton } from "@/components/client";
import { Logo } from "@/components/logo";
import { currentUser } from "@/lib/auth";
import { getConfig } from "@/lib/config";

function AiModePill() {
  const cfg = getConfig();
  if (cfg.aiMode === "vertex") {
    return (
      <span
        className="rounded-full bg-emerald-400/15 px-2.5 py-1 text-[11px] font-medium text-emerald-200"
        title={`New uploads are read by ${cfg.geminiModel}${cfg.geminiFallbackModel ? `, with ${cfg.geminiFallbackModel} as fallback` : ""} (Vertex AI, project ${cfg.gcpProject}, ${cfg.gcpLocation}). Each document shows the model that actually read it, which can differ for earlier readings.`}
      >
        Live extraction · new uploads read by {cfg.geminiModel}
      </span>
    );
  }
  return (
    <span className="rounded-full bg-amber-300/15 px-2.5 py-1 text-[11px] font-medium text-amber-200" title="No live AI calls are made. Synthetic samples use hand-written fixture extractions.">
      Demo mode · no live AI calls
    </span>
  );
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  return (
    <>
        {user && (
          <header className="no-print bg-navy-950 text-white">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
              <Link href="/dashboard" className="flex items-center rounded-md py-0.5">
                <Logo height={28} priority />
              </Link>
              <nav className="flex flex-wrap gap-1 text-sm">
                <Link href="/dashboard" className="whitespace-nowrap rounded-md px-3 py-1.5 text-white/80 hover:bg-white/10 hover:text-white">Dashboard</Link>
                <Link href="/cases/new" className="whitespace-nowrap rounded-md px-3 py-1.5 text-white/80 hover:bg-white/10 hover:text-white">New case</Link>
                <Link href="/review" className="whitespace-nowrap rounded-md px-3 py-1.5 text-white/80 hover:bg-white/10 hover:text-white">Review queue</Link>
                <Link href="/about" className="whitespace-nowrap rounded-md px-3 py-1.5 text-white/80 hover:bg-white/10 hover:text-white">How it works</Link>
              </nav>
              <div className="ml-auto flex items-center gap-4">
                <AiModePill />
                <span className="text-xs text-white/80">{user}</span>
                <SignOutButton />
              </div>
            </div>
          </header>
        )}
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </>
  );
}
