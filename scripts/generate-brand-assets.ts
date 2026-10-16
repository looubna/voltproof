// Browser and home-screen icons, derived from the VoltProof mark.
//
// Source artwork (committed, from the landing page design export):
//   src/assets/brand/voltproof-mark.png          380×380, the square mark
//   src/assets/brand/voltproof-logo-on-dark.png  1800×380, mark + light wordmark (used in pages via next/image)
//
// Outputs (committed; re-run `npm run brand` whenever the artwork changes):
//   src/app/favicon.ico          48, 32 and 16 px, served at /favicon.ico (Next.js file convention)
//   src/app/apple-icon.png       180 px on navy; iOS needs an opaque icon and rounds the corners itself
//   public/icons/icon-192.png    web app manifest icons (src/app/manifest.ts)
//   public/icons/icon-512.png
//   public/icons/icon-maskable-512.png  on navy, mark inside the maskable safe zone
//
// Sizes and padding match the landing site (site/scripts/build-assets.mjs), so both look the same.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp, { type Sharp } from "sharp";

const root = process.cwd();
const MARK = path.join(root, "src/assets/brand/voltproof-mark.png");
const LOGO = path.join(root, "src/assets/brand/voltproof-logo-on-dark.png");
const APP = path.join(root, "src/app");
const ICONS = path.join(root, "public/icons");
// --color-navy-950 in src/app/globals.css.
const NAVY = "#0f1c2b";

const png = (s: Sharp) => s.png({ compressionLevel: 9, palette: true });

/** Fails loudly if replaced artwork no longer has the expected shape, instead of producing stretched icons. */
async function checkArtwork() {
  const mark = await sharp(MARK).metadata();
  const logo = await sharp(LOGO).metadata();
  if (!mark.width || mark.width !== mark.height) throw new Error(`${MARK} must be square (is ${mark.width}×${mark.height}).`);
  if (mark.width < 192) throw new Error(`${MARK} must be at least 192 px (is ${mark.width}).`);
  if (!mark.hasAlpha || !logo.hasAlpha) throw new Error("The brand artwork must have a transparent background.");
  console.log(`mark ${mark.width}×${mark.height}, logo ${logo.width}×${logo.height}`);
  if (mark.width < 512) console.warn(`Note: the 512 px icons are upscaled from the ${mark.width} px mark. Supply a mark of 512 px or more (or an SVG) for sharper home-screen icons.`);
}

/** The mark centred on an opaque navy square, `scale` of the icon's width. */
async function onNavy(size: number, scale: number) {
  const mark = await sharp(MARK).resize(Math.round(size * scale)).toBuffer();
  return png(sharp({ create: { width: size, height: size, channels: 4, background: NAVY } }).composite([{ input: mark, gravity: "center" }])).toBuffer();
}

/** An .ico holding PNG images, which every current browser and Windows reads. */
function ico(images: { size: number; data: Buffer }[]) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = icon
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, data }, i) => {
    const entry = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, entry); // width (0 means 256)
    header.writeUInt8(size >= 256 ? 0 : size, entry + 1); // height
    header.writeUInt16LE(1, entry + 4); // colour planes
    header.writeUInt16LE(32, entry + 6); // bits per pixel
    header.writeUInt32LE(data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map((i) => i.data)]);
}

async function main() {
  await checkArtwork();
  await mkdir(ICONS, { recursive: true });

  // Largest first: Next.js declares the first image's size in <link rel="icon" sizes>, and browsers still pick the best image inside.
  const favicon = await Promise.all([48, 32, 16].map(async (size) => ({ size, data: await sharp(MARK).resize(size).png().toBuffer() })));
  const outputs: [string, Buffer][] = [
    [path.join(APP, "favicon.ico"), ico(favicon)],
    [path.join(APP, "apple-icon.png"), await onNavy(180, 0.78)],
    [path.join(ICONS, "icon-192.png"), await png(sharp(MARK).resize(192)).toBuffer()],
    [path.join(ICONS, "icon-512.png"), await png(sharp(MARK).resize(512)).toBuffer()],
    // Maskable icons may be cropped to a circle of 80% of their width; at 62% the whole tile stays inside it.
    [path.join(ICONS, "icon-maskable-512.png"), await onNavy(512, 0.62)],
  ];
  for (const [file, data] of outputs) {
    await writeFile(file, data);
    console.log(`${path.relative(root, file)} (${(data.length / 1024).toFixed(1)} KB)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
