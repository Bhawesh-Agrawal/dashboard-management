import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/health/route";
import { proxy, config } from "@/proxy";

describe("GET /api/health", () => {
  it("returns 200 with ok: true and ISO time", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; time: string };
    expect(body.ok).toBe(true);
    expect(() => new Date(body.time).toISOString()).not.toThrow();
  });

  it("is excluded in src/proxy.ts and its matcher", async () => {
    const req = new NextRequest("http://localhost:3000/api/health");
    const res = await proxy(req);
    expect(res.status).toBe(200);
    expect(config.matcher[0]).toContain("api/health");
  });
});
