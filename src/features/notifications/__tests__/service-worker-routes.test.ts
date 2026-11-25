import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

function getValidAppRoutes(appDir: string): Set<string> {
  const routes = new Set<string>();

  function scan(dir: string, currentRoute: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const seg = entry.name;
        // Ignore private folders (_components, etc.) and API routes
        if (seg.startsWith("_") || seg === "api") continue;

        // Route groups (e.g. `(app)`, `(auth)`) do not add to the URL path
        const nextRoute = seg.startsWith("(") && seg.endsWith(")")
          ? currentRoute
          : `${currentRoute}/${seg}`;

        scan(path.join(dir, seg), nextRoute);
      } else if (entry.isFile() && /^page\.(tsx|jsx|js)$/.test(entry.name)) {
        routes.add(currentRoute === "" ? "/" : currentRoute);
      }
    }
  }

  scan(appDir, "");
  return routes;
}

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

  it("verifies all APP_SHELL_FILES in public/sw.js correspond to real static page routes", () => {
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

    const validRoutes = getValidAppRoutes(path.resolve(process.cwd(), "src/app"));

    for (const file of files) {
      expect(
        validRoutes.has(file),
        `Service Worker APP_SHELL_FILES URL "${file}" has no matching page in src/app (must match an existing page route)`
      ).toBe(true);
    }
  });

  it("proves the route validator fails on fake or removed shell URLs", () => {
    const validRoutes = getValidAppRoutes(path.resolve(process.cwd(), "src/app"));
    const fakeUrls = ["/courses", "/fake-route-nonexistent", "/budget", "/library", "/people"];
    for (const fakeUrl of fakeUrls) {
      expect(
        validRoutes.has(fakeUrl),
        `Expected validator to reject "${fakeUrl}" because it does not exist in src/app`
      ).toBe(false);
    }
  });
});
