import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const PALETTE_CLASS_REGEX =
  /\b(?:bg|text|border|ring)-(?:red|green|amber|yellow|blue|emerald|rose|orange|lime|teal|cyan|sky|indigo|violet|purple|pink|fuchsia)-\d{2,3}\b/g;

function collectSourceFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectSourceFiles(fullPath));
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

describe("UI palette guard", () => {
  it("forbids hardcoded Tailwind palette color classes in guarded UI features", () => {
    const roots = [
      path.resolve(process.cwd(), "src/features/attendance"),
      path.resolve(process.cwd(), "src/features/dsa"),
      path.resolve(process.cwd(), "src/features/briefs"),
      path.resolve(process.cwd(), "src/features/notifications/components"),
      path.resolve(process.cwd(), "src/features/calendar/components"),
      path.resolve(process.cwd(), "src/features/settings/components"),
      path.resolve(process.cwd(), "src/features/semesters/components"),
      path.resolve(process.cwd(), "src/features/schedule/components"),
    ];

    const violations: string[] = [];

    for (const root of roots) {
      for (const filePath of collectSourceFiles(root)) {
        const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
        lines.forEach((line, idx) => {
          const matches = line.match(PALETTE_CLASS_REGEX);
          if (matches && matches.length > 0) {
            const rel = path.relative(process.cwd(), filePath);
            violations.push(`${rel}:${idx + 1}: ${matches.join(", ")}`);
          }
        });
      }
    }

    expect(violations).toEqual([]);
  });
});
