import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const mockToArray = vi.fn();
const mockCount = vi.fn();
const mockUpdate = vi.fn();

function makeMockTable() {
  return {
    where: () => ({
      equals: () => ({
        toArray: () => mockToArray(),
        count: () => mockCount(),
      }),
    }),
    update: (...args: unknown[]) => mockUpdate(...args),
    delete: vi.fn(),
  };
}

vi.mock("../db", () => ({
  db: {
    tasks: makeMockTable(),
    courses: { where: () => ({ equals: () => ({ toArray: async () => [], count: async () => 0 }) }) },
    notes: { where: () => ({ equals: () => ({ toArray: async () => [], count: async () => 0 }) }) },
    routines: { where: () => ({ equals: () => ({ toArray: async () => [], count: async () => 0 }) }) },
    events: { where: () => ({ equals: () => ({ toArray: async () => [], count: async () => 0 }) }) },
    classSchedules: { where: () => ({ equals: () => ({ toArray: async () => [], count: async () => 0 }) }) },
    assessments: { where: () => ({ equals: () => ({ toArray: async () => [], count: async () => 0 }) }) },
  },
}));

import { syncManager } from "../sync-manager";

describe("SyncManager status visibility & failure surfacing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    Object.defineProperty(globalThis, "navigator", {
      value: { onLine: true },
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("surfaces push failure in lastError and keeps dirtyCount instead of swallowing", async () => {
    mockToArray.mockResolvedValue([{ id: "t1", title: "Offline task", dirty: 1 }]);
    mockCount.mockResolvedValue(1);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "Server unavailable" }),
    }) as unknown as typeof fetch;

    await syncManager.pushDirtyRows();

    const snap = syncManager.getSnapshot();
    expect(snap.dirtyCount).toBe(1);
    expect(snap.lastError).toContain("API write failed: 500");
  });

  it("clears dirtyCount and sets lastSuccessAt when push succeeds", async () => {
    mockToArray.mockResolvedValue([{ id: "t1", title: "Offline task", dirty: 1 }]);
    mockCount.mockResolvedValue(0);
    mockUpdate.mockResolvedValue(1);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ record: { updatedAt: "2026-11-27T10:00:00.000Z" } }),
    }) as unknown as typeof fetch;

    await syncManager.pushDirtyRows();

    const snap = syncManager.getSnapshot();
    expect(snap.dirtyCount).toBe(0);
    expect(snap.lastError).toBeNull();
    expect(snap.lastSuccessAt).not.toBeNull();
  });
});
