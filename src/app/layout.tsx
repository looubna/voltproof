import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { TECHNICAL_COOKIE } from "@/lib/preferences";
import "./globals.css";

const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-plex-sans" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono" });

// Icons come from file conventions in this folder (favicon.ico, apple-icon.png, manifest.ts),
// all generated from the brand mark by `npm run brand`.
export const metadata: Metadata = {
  title: "VoltProof · Evidence intelligence for used EVs",
  description: "Know what is proven before you buy or finance a used EV. Gemini reads, rules decide, people resolve.",
  applicationName: "VoltProof",
};

// Matches the navy header, so mobile browser bars blend with it (--color-navy-950).
export const viewport: Viewport = {
  themeColor: "#0f1c2b",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Render every page per request, so Next.js can add the Content-Security-Policy nonce
  // (src/middleware.ts) to its scripts. Without this, the built-in 404 page is prerendered
  // at build time without a nonce, and the browser blocks its scripts.
  await connection();
  // Read here so the first paint already hides or shows technical details (see globals.css).
  const technical = (await cookies()).get(TECHNICAL_COOKIE)?.value === "on";
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`} data-technical={technical ? "on" : "off"}>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
