import type { MetadataRoute } from "next";

// Served at /manifest.webmanifest and linked from every page by Next.js. The icons
// are generated from the brand mark by `npm run brand` (scripts/generate-brand-assets.ts).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "VoltProof",
    short_name: "VoltProof",
    description: "Evidence review for used electric vehicles. Gemini reads, rules decide, people resolve.",
    start_url: "/dashboard",
    display: "browser",
    // --color-canvas and --color-navy-950 in globals.css.
    background_color: "#f3f1ec",
    theme_color: "#0f1c2b",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
