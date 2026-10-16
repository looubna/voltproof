// Renders a handwritten service-book page (synthetic) for the live demo:
// samples/extra/kona-service-book-handwritten.jpg. Read live by Gemini and
// PaddleOCR; not used by demo mode, which only knows the fixture samples.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const lines: [number, number, string, number][] = [
  // x, y, text, font size
  [110, 250, "Service 14", 46],
  [110, 340, "Date: 12 / 07 / 2026", 40],
  [110, 420, "Odometer: 46,980 km", 40],
  [110, 500, "VIN: KMHK381G8LU072518", 38],
  [110, 590, "Annual inspection, coolant", 38],
  [110, 650, "check, brake fluid changed", 38],
  [110, 750, "Lakeside EV Centre - J. Park", 36],
];

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="1000">
  <defs>
    <filter id="paper"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7"/><feColorMatrix values="0 0 0 0 0.96  0 0 0 0 0.94  0 0 0 0 0.88  0 0 0 0.10 0"/><feBlend in="SourceGraphic" mode="multiply"/></filter>
  </defs>
  <rect width="1100" height="1000" fill="#f6f1e3"/>
  <rect width="1100" height="1000" fill="#f6f1e3" filter="url(#paper)"/>
  <text x="110" y="120" font-family="Helvetica, Arial" font-size="30" font-weight="bold" fill="#555">SERVICE BOOK · MAINTENANCE RECORD</text>
  <text x="110" y="160" font-family="Helvetica, Arial" font-size="20" fill="#8a4b00">SYNTHETIC SAMPLE - FICTIONAL DATA FOR DEMONSTRATION ONLY</text>
  ${Array.from({ length: 9 }, (_, i) => `<line x1="90" x2="1010" y1="${265 + i * 80}" y2="${265 + i * 80}" stroke="#b9c7d8" stroke-width="2"/>`).join("")}
  <g transform="rotate(-1.2 550 500)" fill="#1d2f7a">
    ${lines.map(([x, y, t, s], i) => `<text x="${x + (i % 2) * 6}" y="${y}" font-family="Bradley Hand, Noteworthy, Marker Felt, cursive" font-size="${s}" font-weight="bold">${esc(t)}</text>`).join("")}
  </g>
</svg>`;

async function main() {
  const out = path.join(process.cwd(), "samples", "extra", "kona-service-book-handwritten.jpg");
  await mkdir(path.dirname(out), { recursive: true });
  // Rotated slightly and saved as a phone-scan JPEG.
  const img = await sharp(Buffer.from(svg)).rotate(0.8, { background: "#e9e4d6" }).jpeg({ quality: 82 }).toBuffer();
  await writeFile(out, img);
  console.log(`wrote ${out} (${img.length} bytes)`);
}
main();
