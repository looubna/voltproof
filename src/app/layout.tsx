import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import Link from "next/link";
import { SignOutButton } from "@/components/client";
import { currentUser } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import "./globals.css";

const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-plex-sans" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono" });

export const metadata: Metadata = {
  title: "VoltProof",
  description: "Evidence review for used electric vehicles. Gemini reads. Rules decide. People resolve.",
};

function AiModePill() {
  const cfg = getConfig();
  if (cfg.aiMode === "vertex") {
    return (
      <span className="rounded-full bg-emerald-400/15 px-2.5 py-1 text-[11px] font-medium text-emerald-200" title={`Project ${cfg.gcpProject}, ${cfg.gcpLocation}`}>
        Live extraction · {cfg.geminiModel} on Vertex AI
      </span>
    );
  }
  return (
    <span className="rounded-full bg-amber-300/15 px-2.5 py-1 text-[11px] font-medium text-amber-200" title="No live AI calls are made. Synthetic samples use hand-written fixture extractions.">
      Demo mode · no live AI calls
    </span>
  );
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen">
        {user && (
          <header className="no-print bg-navy-950 text-white">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
              <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
                <svg viewBox="0 0 32 32" className="h-6 w-6" aria-hidden>
                  <rect width="32" height="32" rx="7" fill="#2458c4" />
                  <path d="M17.5 5 9 18h6l-1.5 9L23 13.5h-6.2z" fill="#fff" />
                </svg>
                VoltProof
              </Link>
              <nav className="flex flex-wrap gap-1 text-sm">
                <Link href="/" className="whitespace-nowrap rounded-md px-3 py-1.5 text-white/80 hover:bg-white/10 hover:text-white">Dashboard</Link>
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
      </body>
    </html>
  );
}
