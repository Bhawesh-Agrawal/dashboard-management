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

describe("sync-manager: dirty rows protection during seedAll", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(mockDb)) {
      (mockDb as any)[key]._setRows([]);
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("isEntityDirty", () => {
    it("identifies dirty: 1 as dirty", () => {
      expect(isEntityDirty({ id: "1", dirty: 1 })).toBe(true);
    });

    it("identifies dirty: true as dirty", () => {
      expect(isEntityDirty({ id: "1", dirty: true })).toBe(true);
    });

    it("identifies _dirty: true as dirty", () => {
      expect(isEntityDirty({ id: "1", _dirty: true })).toBe(true);
    });

    it("identifies _syncStatus !== 'synced' as dirty", () => {
      expect(isEntityDirty({ id: "1", _syncStatus: "pending" })).toBe(true);
      expect(isEntityDirty({ id: "1", _syncStatus: "modified" })).toBe(true);
      expect(isEntityDirty({ id: "1", _syncStatus: "synced" })).toBe(false);
    });

    it("identifies _deleted: 1 or true as dirty", () => {
      expect(isEntityDirty({ id: "1", _deleted: 1 })).toBe(true);
      expect(isEntityDirty({ id: "1", _deleted: true })).toBe(true);
    });

    it("identifies entity referenced in pendingQueueIds as dirty", () => {
      const pendingQueue = new Set(["task-in-queue"]);
      expect(isEntityDirty({ id: "task-in-queue", dirty: 0 }, pendingQueue)).toBe(true);
      expect(isEntityDirty({ id: "task-not-in-queue", dirty: 0 }, pendingQueue)).toBe(false);
    });

    it("returns false for clean synced entity", () => {
      expect(isEntityDirty({ id: "1", dirty: 0, _deleted: 0, _syncStatus: "synced" })).toBe(false);
    });
  });

  describe("seedAll() dirty protection", () => {
    it("preserves dirty rows and does not overwrite them with server data", async () => {
      // Setup local Dexie state:
      // 1. Clean task that exists locally
      // 2. Dirty task with local edits that exists on server
      // 3. Dirty task created offline that does not exist on server yet
      mockDb.tasks._setRows([
        { id: "task-clean", title: "Clean Local Task", dirty: 0, _deleted: 0 } as any,
        { id: "task-dirty-1", title: "Local Unsaved Edit", dirty: 1, _deleted: 0 } as any,
        { id: "task-offline-new", title: "Created Offline", _dirty: true, _syncStatus: "pending" } as any,
      ]);

      mockDb.notes._setRows([
        { id: "note-dirty", title: "Offline Note", _syncStatus: "modified", dirty: 0 } as any,
      ]);

      // Server returns updated versions of task-clean and task-dirty-1, plus a new server task
      const serverSeedData = {
        tasks: [
          { id: "task-clean", title: "Updated Clean From Server" },
          { id: "task-dirty-1", title: "Stale Server Version" },
          { id: "task-new-from-server", title: "Brand New Server Task" },
        ],
        notes: [
          { id: "note-dirty", title: "Server Note Overwrite Attempt" },
          { id: "note-server", title: "New Server Note" },
        ],
        courses: [],
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

      await syncManager.seedAll();

      const finalTasks = mockDb.tasks._getRows();
      const finalNotes = mockDb.notes._getRows();

      // Clean task was replaced with server version
      const cleanTask = finalTasks.find((t) => t.id === "task-clean");
      expect(cleanTask?.title).toBe("Updated Clean From Server");

      // Dirty task-dirty-1 was NOT overwritten by server data
      const dirtyTask1 = finalTasks.find((t) => t.id === "task-dirty-1");
      expect(dirtyTask1?.title).toBe("Local Unsaved Edit");
      expect(dirtyTask1?.dirty).toBe(1);

      // Offline new task was preserved
      const offlineTask = finalTasks.find((t) => t.id === "task-offline-new");
      expect(offlineTask?.title).toBe("Created Offline");

      // New server task was inserted
      const newServerTask = finalTasks.find((t) => t.id === "task-new-from-server");
      expect(newServerTask?.title).toBe("Brand New Server Task");

      // Note with _syncStatus: "modified" was NOT overwritten
      const dirtyNote = finalNotes.find((n) => n.id === "note-dirty");
      expect(dirtyNote?.title).toBe("Offline Note");

      // New note was inserted
      const newNote = finalNotes.find((n) => n.id === "note-server");
      expect(newNote?.title).toBe("New Server Note");
    });
  });
});
