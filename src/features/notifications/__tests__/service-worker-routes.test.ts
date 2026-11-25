import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("Service Worker Route Validation & Push Attendance", () => {
  const swPath = path.resolve(process.cwd(), "public/sw.js");
  const swContent = fs.readFileSync(swPath, "utf-8");

  it("extracts all fetch URLs in public/sw.js and verifies each resolves to a real route handler", () => {
    // Regex matching relative API URLs in fetch calls, e.g. fetch("/api/...")
    const fetchRegex = /fetch\(\s*["'](\/api\/[^"'\s]+)["']/g;
    const matchedEndpoints: string[] = [];

    let match;
    while ((match = fetchRegex.exec(swContent)) !== null) {
      if (!matchedEndpoints.includes(match[1])) {
        matchedEndpoints.push(match[1]);
      }
    }

    expect(matchedEndpoints.length).toBeGreaterThan(0);

    for (const endpoint of matchedEndpoints) {
      const routePath = path.resolve(process.cwd(), `src/app${endpoint}/route.ts`);
      const routeExists = fs.existsSync(routePath);
      expect(
        routeExists,
        `Service worker endpoint "${endpoint}" must have a corresponding route handler at "${routePath}"`
      ).toBe(true);
    }
  });

  it("ensures public/sw.js sends classScheduleId in push attendance mark action", () => {
    expect(swContent).toContain("classScheduleId: data.classScheduleId");
    expect(swContent).toContain('fetch("/api/attendance/mark-from-push"');
  });

  it("verifies push subscription code does not reference non-existent /api/notifications/subscribe", () => {
    // Push subscription in this project uses the subscribeToPush server action, not a REST route
    const nonExistentRoute = path.resolve(process.cwd(), "src/app/api/notifications/subscribe/route.ts");
    expect(fs.existsSync(nonExistentRoute)).toBe(false);

    // Verify sw.js does not fetch it
    expect(swContent).not.toContain("/api/notifications/subscribe");
  });

  it("verifies all APP_SHELL_FILES in public/sw.js exist and do not contain dead removed routes", () => {
    expect(swContent).not.toContain('"/budget"');
    expect(swContent).not.toContain('"/library"');
    expect(swContent).not.toContain('"/people"');

    const appShellMatch = swContent.match(/const APP_SHELL_FILES = \[([\s\S]*?)\];/);
    expect(appShellMatch).not.toBeNull();
    const files = appShellMatch![1]
      .split("\n")
      .map((line) => line.trim().replace(/[",]/g, ""))
      .filter((line) => line.startsWith("/"));

    expect(files.length).toBeGreaterThan(0);
    expect(files).toContain("/today");
    expect(files).toContain("/tasks");
    expect(files).toContain("/settings");
  });
});
