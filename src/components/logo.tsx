// The VoltProof logo, from the landing page design export (artwork in src/assets/brand).
// Every page uses these two components; browser icons are generated from the same
// mark by `npm run brand`. Static imports let next/image size the images (no layout
// shift) and serve resized WebP copies with long-lived, content-hashed URLs.
import Image from "next/image";
import logoOnDark from "@/assets/brand/voltproof-logo-on-dark.png";
import mark from "@/assets/brand/voltproof-mark.png";

// Above the default of 75, so the wordmark's and the bolt's edges stay crisp (allowed in next.config.ts).
const QUALITY = 90;

interface Props {
  className?: string;
  /** For logos visible when the page first paints (headers, sign-in): loads them first instead of lazily. */
  priority?: boolean;
}

/**
 * The mark with the "VoltProof" wordmark. The wordmark is light, so use this on
 * navy or other dark backgrounds only; on light backgrounds use LogoMark next to text.
 */
export function Logo({ height = 32, className, priority }: Props & { height?: number }) {
  const width = Math.round((height * logoOnDark.width) / logoOnDark.height);
  return <Image src={logoOnDark} alt="VoltProof" width={width} height={height} quality={QUALITY} priority={priority} className={className} />;
}

/**
 * The square mark on its own. Works on any background. Decorative by default
 * (empty alt), because it normally sits next to the name in text; pass `alt` when it stands alone.
 */
export function LogoMark({ size = 28, alt = "", className, priority }: Props & { size?: number; alt?: string }) {
  return <Image src={mark} alt={alt} width={size} height={size} quality={QUALITY} priority={priority} className={className} />;
}
