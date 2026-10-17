import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";

const root = process.cwd();

describe("brand assets", () => {
  it("serves every manifest icon from public/ at the size it declares", async () => {
    const icons = manifest().icons ?? [];
    expect(icons.length).toBeGreaterThan(0);
    for (const icon of icons) {
      const meta = await sharp(path.join(root, "public", icon.src)).metadata();
      expect(`${meta.width}x${meta.height}`).toBe(icon.sizes);
      expect(meta.format).toBe("png");
    }
  });

  it("has a favicon.ico with 48, 32 and 16 px images, largest first", async () => {
    const ico = await readFile(path.join(root, "src/app/favicon.ico"));
    expect(ico.readUInt16LE(2)).toBe(1); // icon type
    const sizes = Array.from({ length: ico.readUInt16LE(4) }, (_, i) => ico.readUInt8(6 + 16 * i));
    expect(sizes).toEqual([48, 32, 16]);
  });

  it("has an opaque 180 px Apple touch icon", async () => {
    const meta = await sharp(path.join(root, "src/app/apple-icon.png")).stats();
    const { width, height } = await sharp(path.join(root, "src/app/apple-icon.png")).metadata();
    expect([width, height]).toEqual([180, 180]);
    expect(meta.isOpaque).toBe(true);
  });

  it("keeps the source artwork the logo components import", async () => {
    for (const f of ["voltproof-mark.png", "voltproof-logo-on-dark.png"]) {
      expect((await stat(path.join(root, "src/assets/brand", f))).size).toBeGreaterThan(0);
    }
  });
});
