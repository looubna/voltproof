// Types for static image imports (`import mark from "@/assets/brand/voltproof-mark.png"`).
// next-env.d.ts declares them too, but Next.js generates that file on `next dev` / `next build`
// and it is not committed, so `npm run typecheck` on a fresh clone or in CI needs this reference.
/// <reference types="next/image-types/global" />
