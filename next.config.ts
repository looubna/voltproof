import type { NextConfig } from "next";

// Sent on every response. The Content-Security-Policy is set per request in
// src/middleware.ts, because it carries a fresh nonce for Next.js's inline scripts.
const SECURITY_HEADERS = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // SAMEORIGIN, not DENY: the document viewer shows stored PDFs in an iframe from this origin.
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // Server-only SDKs: keep them out of the bundler.
  serverExternalPackages: ["@google-cloud/firestore", "@google-cloud/storage", "@google/genai"],
  outputFileTracingIncludes: { "/**": ["./samples/**/*"] },
  experimental: { serverActions: { bodySizeLimit: "12mb" } },
  // Image qualities next/image may request: the default, and 90 for the logo (src/components/logo.tsx).
  images: { qualities: [75, 90] },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
