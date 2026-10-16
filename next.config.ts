import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Server-only SDKs: keep them out of the bundler.
  serverExternalPackages: ["@google-cloud/firestore", "@google-cloud/storage", "@google/genai"],
  outputFileTracingIncludes: { "/**": ["./samples/**/*"] },
  experimental: { serverActions: { bodySizeLimit: "12mb" } },
};

export default nextConfig;
