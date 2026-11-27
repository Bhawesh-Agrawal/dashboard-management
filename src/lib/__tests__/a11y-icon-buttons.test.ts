import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const ROOTS = [
  "src/components/layout",
  "src/features/calendar/components",
  "src/features/semesters/components",
  "src/features/schedule/components",
];

function collectTsxFiles(dir: string): string[] {
  const abs = path.join(process.cwd(), dir);
  if (!fs.existsSync(abs)) return [];
  const results: string[] = [];
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const full = path.join(abs, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTsxFiles(path.relative(process.cwd(), full)));
    } else if (entry.isFile() && entry.name.endsWith(".tsx")) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Flags native `<button ...>...</button>` elements whose visible body is
 * solely an icon component (e.g. `<ChevronLeft className="..." />`) without
 * `aria-label`, `aria-labelledby`, or `title`.
 */
function findUnlabeledIconButtons(filePath: string): Array<{ line: number; snippet: string }> {
  const src = fs.readFileSync(filePath, "utf8");
  const issues: Array<{ line: number; snippet: string }> = [];
  const buttonRegex = /<button\b([\s\S]*?)>([\s\S]*?)<\/button>/g;
  let match: RegExpExecArray | null;

  while ((match = buttonRegex.exec(src)) !== null) {
    const attrs = match[1];
    const body = match[2].trim();

    if (/aria-label=|aria-labelledby=|title=/.test(attrs)) continue;

    // Strip JSX comments and whitespace
    const cleanedBody = body.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").trim();
    // Check if body is strictly a single self-closing PascalCase tag (an icon)
    if (/^<[A-Z][A-Za-z0-9]*\b[^>]*\/>$/.test(cleanedBody)) {
      const line = src.slice(0, match.index).split("\n").length;
      issues.push({
        line,
        snippet: `<button${attrs.replace(/\s+/g, " ").slice(0, 80)}>${cleanedBody}</button>`,
      });
    }
  }

  return issues;
}

describe("Accessibility: icon-only buttons have accessible labels", () => {
  it("all icon-only <button> elements in layout/calendar/semesters/schedule have aria-label, aria-labelledby, or title", () => {
    const files = ROOTS.flatMap(collectTsxFiles);
    expect(files.length).toBeGreaterThan(0);

    const violations: string[] = [];
    for (const file of files) {
      const issues = findUnlabeledIconButtons(file);
      for (const issue of issues) {
        violations.push(`${path.relative(process.cwd(), file)}:${issue.line} -> ${issue.snippet}`);
      }
    }

    expect(violations).toEqual([]);
  });
});
