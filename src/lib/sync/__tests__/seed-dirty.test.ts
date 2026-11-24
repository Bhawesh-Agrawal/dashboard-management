import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

const { mockDb } = vi.hoisted(() => {
  function createMockTable<T = any>(initial: T[] = []) {
    let rows: T[] = [...initial];
    return {
      toArray: vi.fn(async () => [...rows]),
      bulkDelete: vi.fn(async (ids: string[]) => {
        rows = rows.filter((r: any) => !ids.includes(r.id));
      }),
      bulkPut: vi.fn(async (newRows: T[]) => {
        for (const row of newRows) {
          const idx = rows.findIndex((r: any) => r.id === (row as any).id);
          if (idx >= 0) rows[idx] = row;
          else rows.push(row);
        }
      }),
      put: vi.fn(async (row: T) => {
        const idx = rows.findIndex((r: any) => r.id === (row as any).id);
        if (idx >= 0) rows[idx] = row;
        else rows.push(row);
      }),
      update: vi.fn(async (id: string, updates: Partial<T>) => {
        const idx = rows.findIndex((r: any) => r.id === id);
        if (idx >= 0) {
          rows[idx] = { ...rows[idx], ...updates };
        }
      }),
      delete: vi.fn(async (id: string) => {
        rows = rows.filter((r: any) => r.id !== id);
      }),
      clear: vi.fn(async () => {
        rows = [];
      }),
      get: vi.fn(async (id: string) => rows.find((r: any) => r.id === id)),
      _getRows: () => rows,
      _setRows: (newRows: T[]) => {
        rows = [...newRows];
      },
    };
  }

  return {
    mockDb: {
      tasks: createMockTable(),
      courses: createMockTable(),
      notes: createMockTable(),
      routines: createMockTable(),
      events: createMockTable(),
      routineCompletions: createMockTable(),
      attendance: createMockTable(),
      classSchedules: createMockTable(),
      assessments: createMockTable(),
    },
  };
});

vi.mock("@/lib/sync/db", () => ({
  db: mockDb,
}));

import { syncManager, isEntityDirty } from "../sync-manager";

describe("sync-manager: dirty rows protection and server deletion in seedAll", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(mockDb)) {
      (mockDb as any)[key]._setRows([]);
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("isEntityDirty (real schema markers)", () => {
    it("identifies dirty: 1 as dirty", () => {
      expect(isEntityDirty({ id: "1", dirty: 1 })).toBe(true);
      expect(isEntityDirty({ id: "1", dirty: true })).toBe(true);
    });

    it("identifies _deleted: 1 as dirty", () => {
      expect(isEntityDirty({ id: "1", _deleted: 1 })).toBe(true);
      expect(isEntityDirty({ id: "1", _deleted: true })).toBe(true);
    });

    it("identifies entity referenced in pendingQueueIds as dirty", () => {
      const pendingQueue = new Set(["task-in-queue"]);
      expect(isEntityDirty({ id: "task-in-queue", dirty: 0, _deleted: 0 }, pendingQueue)).toBe(true);
      expect(isEntityDirty({ id: "task-not-in-queue", dirty: 0, _deleted: 0 }, pendingQueue)).toBe(false);
    });

    it("returns false for clean synced entity without guessed flags", () => {
      expect(isEntityDirty({ id: "1", dirty: 0, _deleted: 0 })).toBe(false);
      expect(isEntityDirty(null)).toBe(false);
      expect(isEntityDirty(undefined)).toBe(false);
    });
  });

  describe("seedAll() sync behavior", () => {
    it("proves: dirty rows survive seedAll AND clean rows deleted on the server are removed after seedAll", async () => {
      // 1. Simulate real local write paths:
      // a) Clean task previously synced from server
      await mockDb.tasks.put({
        id: "task-clean-surviving",
        title: "Clean Local Task",
        dirty: 0,
        _deleted: 0,
      });

      // b) Clean task that was DELETED on server (server seed will omit this row)
      await mockDb.tasks.put({
        id: "task-deleted-on-server",
        title: "Old Task To Be Removed",
        dirty: 0,
        _deleted: 0,
      });

      // c) Dirty task modified locally while offline (dirty: 1)
      await mockDb.tasks.put({
        id: "task-dirty-edited",
        title: "Local Unsaved Edit",
        dirty: 1,
        _deleted: 0,
      });

      // d) Dirty task created locally while offline (dirty: 1)
      await mockDb.tasks.put({
        id: "task-offline-created",
        title: "Brand New Offline Task",
        dirty: 1,
        _deleted: 0,
      });

      // e) Locally soft-deleted task awaiting push (_deleted: 1, dirty: 1)
      await mockDb.tasks.put({
        id: "task-soft-deleted",
        title: "Soft Deleted Locally",
        dirty: 1,
        _deleted: 1,
      });

      // Server returns seed data containing:
      // - Updated version of task-clean-surviving
      // - Outdated server copy of task-dirty-edited (must not overwrite local edit)
      // - A brand new task from another device
      // (task-deleted-on-server is NOT present in serverSeedData)
      const serverSeedData = {
        tasks: [
          { id: "task-clean-surviving", title: "Updated Clean Title From Server" },
          { id: "task-dirty-edited", title: "Outdated Server Version" },
          { id: "task-brand-new-from-server", title: "New Task From Cloud" },
        ],
        courses: [],
        notes: [],
        routines: [],
        events: [],
        routineCompletions: [],
        attendance: [],
        classSchedules: [],
        assessments: [],
      };

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => serverSeedData,
        })
      );

      // Execute seedAll()
      await syncManager.seedAll();

      const finalTasks = mockDb.tasks._getRows();

      // VERIFICATION 1: Clean rows deleted on the server are removed after seedAll
      const deletedTask = finalTasks.find((t) => t.id === "task-deleted-on-server");
      expect(
        deletedTask,
        "Clean row deleted on server must be removed locally after seedAll"
      ).toBeUndefined();

      // VERIFICATION 2: Clean row updated on server is updated locally
      const cleanTask = finalTasks.find((t) => t.id === "task-clean-surviving");
      expect(cleanTask).toBeDefined();
      expect(cleanTask?.title).toBe("Updated Clean Title From Server");
      expect(cleanTask?.dirty).toBe(0);

      // VERIFICATION 3: Dirty modified row SURVIVES and is NOT overwritten by server
      const dirtyEdited = finalTasks.find((t) => t.id === "task-dirty-edited");
      expect(dirtyEdited).toBeDefined();
      expect(dirtyEdited?.title).toBe("Local Unsaved Edit");
      expect(dirtyEdited?.dirty).toBe(1);

      // VERIFICATION 4: Offline-created row SURVIVES seedAll
      const offlineCreated = finalTasks.find((t) => t.id === "task-offline-created");
      expect(offlineCreated).toBeDefined();
      expect(offlineCreated?.title).toBe("Brand New Offline Task");
      expect(offlineCreated?.dirty).toBe(1);

      // VERIFICATION 5: Soft-deleted offline row SURVIVES seedAll
      const softDeleted = finalTasks.find((t) => t.id === "task-soft-deleted");
      expect(softDeleted).toBeDefined();
      expect(softDeleted?._deleted).toBe(1);
      expect(softDeleted?.dirty).toBe(1);

      // VERIFICATION 6: Brand new server task is inserted locally
      const brandNew = finalTasks.find((t) => t.id === "task-brand-new-from-server");
      expect(brandNew).toBeDefined();
      expect(brandNew?.title).toBe("New Task From Cloud");
      expect(brandNew?.dirty).toBe(0);
    });
  });
});
