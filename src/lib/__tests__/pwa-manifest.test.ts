import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

type ManifestIcon = {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
};

type WebManifest = {
  id?: string;
  scope?: string;
  start_url?: string;
  icons?: ManifestIcon[];
};

describe("PWA manifest and icons", () => {
  const publicDir = path.join(process.cwd(), "public");
  const manifestPath = path.join(publicDir, "manifest.json");

  it("defines id, scope, start_url, separate any/maskable icons, and every icon exists on disk", () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as WebManifest;

    expect(manifest.id).toBe("/");
    expect(manifest.scope).toBe("/");
    expect(manifest.start_url).toBe("/today");

    const icons = manifest.icons ?? [];
    expect(icons.length).toBeGreaterThan(0);

    for (const icon of icons) {
      const iconPath = path.join(publicDir, icon.src.replace(/^\//, ""));
      expect(fs.existsSync(iconPath), `Missing icon on disk: ${icon.src}`).toBe(true);

      if (icon.purpose) {
        expect(icon.purpose).not.toContain("any maskable");
      }
    }

    expect(icons.some((i) => i.sizes === "192x192" && i.purpose === "any")).toBe(true);
    expect(icons.some((i) => i.sizes === "192x192" && i.purpose === "maskable")).toBe(true);
    expect(icons.some((i) => i.sizes === "512x512" && i.purpose === "any")).toBe(true);
    expect(icons.some((i) => i.sizes === "512x512" && i.purpose === "maskable")).toBe(true);
  });
});
