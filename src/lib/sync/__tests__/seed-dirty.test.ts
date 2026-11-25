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
import {
  createTask,
  updateTask,
  deleteTask,
  createNote,
  updateNote,
  deleteNote,
} from "../hooks";

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

  describe("seedAll() sync behavior with real Dexie write paths", () => {
    it("proves: dirty rows created/updated/deleted via real write paths survive seedAll AND clean rows deleted on server are removed", async () => {
      // Setup mock fetch to:
      // 1. Simulate offline failure on background /api/sync/write calls made by real write functions
      // 2. Return server seed payload on /api/sync/seed
      const serverSeedData = {
        tasks: [
          { id: "task-clean-surviving", title: "Updated Clean Title From Server" },
          { id: "task-dirty-edited", title: "Outdated Server Version" },
          { id: "task-brand-new-from-server", title: "New Task From Cloud" },
        ],
        courses: [],
        notes: [
          { id: "note-clean-surviving", title: "Clean Note From Server", content: "Updated content from server" },
          { id: "note-dirty-edited", title: "Outdated Server Note", content: "Outdated content" },
        ],
        routines: [],
        events: [],
        routineCompletions: [],
        attendance: [],
        classSchedules: [],
        assessments: [],
      };

      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => {
          if (typeof url === "string" && url.includes("/api/sync/write")) {
            // Simulate offline/unsaved write: the API call fails so the local Dexie row remains dirty
            throw new Error("Network unavailable (offline)");
          }
          if (typeof url === "string" && url.includes("/api/sync/seed")) {
            return {
              ok: true,
              status: 200,
              json: async () => serverSeedData,
            };
          }
          return { ok: false, status: 404 };
        })
      );

      // --- WRITE PATHS UNDER TEST ---
      // Real Dexie write code from src/lib/sync/hooks.ts:
      // 1. createTask() - used by useCreateTask()
      // 2. updateTask() - used by useUpdateTask()
      // 3. deleteTask() - used by useDeleteTask()
      // 4. createNote() - used by useCreateNote()
      // 5. updateNote() - used by useUpdateNote()
      // 6. deleteNote() - used by useDeleteNote()

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

      // c) Clean task modified locally via real updateTask() write path
      await mockDb.tasks.put({
        id: "task-dirty-edited",
        title: "Original Clean Title",
        dirty: 0,
        _deleted: 0,
      });
      await updateTask("task-dirty-edited", {
        title: "Local Unsaved Edit Via Real Write Path",
      });

      // d) Brand new task created offline via real createTask() write path
      await createTask({
        id: "task-offline-created",
        title: "Brand New Offline Task Via Real Write Path",
      });

      // e) Clean task deleted locally via real deleteTask() write path
      await mockDb.tasks.put({
        id: "task-soft-deleted",
        title: "Task To Delete",
        dirty: 0,
        _deleted: 0,
      });
      await deleteTask("task-soft-deleted");

      // f) Notes: clean note, note modified via updateNote(), note created via createNote(), note deleted via deleteNote()
      await mockDb.notes.put({
        id: "note-clean-surviving",
        title: "Clean Note",
        content: "Clean Content",
        dirty: 0,
        _deleted: 0,
      });
      await mockDb.notes.put({
        id: "note-deleted-on-server",
        title: "Old Note To Be Removed",
        content: "Content",
        dirty: 0,
        _deleted: 0,
      });
      await mockDb.notes.put({
        id: "note-dirty-edited",
        title: "Original Note",
        content: "Original Content",
        dirty: 0,
        _deleted: 0,
      });
      await updateNote("note-dirty-edited", {
        content: "Local Unsaved Edit Via Real updateNote()",
      });
      await createNote({
        id: "note-offline-created",
        title: "Offline Note",
        content: "Offline Note Content Via Real createNote()",
      });
      await mockDb.notes.put({
        id: "note-soft-deleted",
        title: "Note To Delete",
        content: "Content",
        dirty: 0,
        _deleted: 0,
      });
      await deleteNote("note-soft-deleted");

      // Verify before seed: dirty markers were created by real write code
      const preTasks = mockDb.tasks._getRows();
      expect(preTasks.find((t) => t.id === "task-dirty-edited")?.dirty).toBe(1);
      expect(preTasks.find((t) => t.id === "task-offline-created")?.dirty).toBe(1);
      expect(preTasks.find((t) => t.id === "task-soft-deleted")?._deleted).toBe(1);
      expect(preTasks.find((t) => t.id === "task-soft-deleted")?.dirty).toBe(1);

      // Execute seedAll()
      await syncManager.seedAll();

      const finalTasks = mockDb.tasks._getRows();
      const finalNotes = mockDb.notes._getRows();

      // VERIFICATION 1: Clean rows deleted on server are removed locally after seedAll
      expect(
        finalTasks.find((t) => t.id === "task-deleted-on-server"),
        "Clean task deleted on server must be removed locally after seedAll"
      ).toBeUndefined();
      expect(
        finalNotes.find((n) => n.id === "note-deleted-on-server"),
        "Clean note deleted on server must be removed locally after seedAll"
      ).toBeUndefined();

      // VERIFICATION 2: Clean rows updated on server are updated locally
      const cleanTask = finalTasks.find((t) => t.id === "task-clean-surviving");
      expect(cleanTask).toBeDefined();
      expect(cleanTask?.title).toBe("Updated Clean Title From Server");
      expect(cleanTask?.dirty).toBe(0);

      const cleanNote = finalNotes.find((n) => n.id === "note-clean-surviving");
      expect(cleanNote).toBeDefined();
      expect(cleanNote?.content).toBe("Updated content from server");
      expect(cleanNote?.dirty).toBe(0);

      // VERIFICATION 3: Dirty modified rows (via updateTask / updateNote) SURVIVE and are NOT overwritten
      const dirtyEditedTask = finalTasks.find((t) => t.id === "task-dirty-edited");
      expect(dirtyEditedTask).toBeDefined();
      expect(dirtyEditedTask?.title).toBe("Local Unsaved Edit Via Real Write Path");
      expect(dirtyEditedTask?.dirty).toBe(1);

      const dirtyEditedNote = finalNotes.find((n) => n.id === "note-dirty-edited");
      expect(dirtyEditedNote).toBeDefined();
      expect(dirtyEditedNote?.content).toBe("Local Unsaved Edit Via Real updateNote()");
      expect(dirtyEditedNote?.dirty).toBe(1);

      // VERIFICATION 4: Offline-created rows (via createTask / createNote) SURVIVE seedAll
      const offlineCreatedTask = finalTasks.find((t) => t.id === "task-offline-created");
      expect(offlineCreatedTask).toBeDefined();
      expect(offlineCreatedTask?.title).toBe("Brand New Offline Task Via Real Write Path");
      expect(offlineCreatedTask?.dirty).toBe(1);

      const offlineCreatedNote = finalNotes.find((n) => n.id === "note-offline-created");
      expect(offlineCreatedNote).toBeDefined();
      expect(offlineCreatedNote?.title).toBe("Offline Note");
      expect(offlineCreatedNote?.dirty).toBe(1);

      // VERIFICATION 5: Soft-deleted offline rows (via deleteTask / deleteNote) SURVIVE seedAll
      const softDeletedTask = finalTasks.find((t) => t.id === "task-soft-deleted");
      expect(softDeletedTask).toBeDefined();
      expect(softDeletedTask?._deleted).toBe(1);
      expect(softDeletedTask?.dirty).toBe(1);

      const softDeletedNote = finalNotes.find((n) => n.id === "note-soft-deleted");
      expect(softDeletedNote).toBeDefined();
      expect(softDeletedNote?._deleted).toBe(1);
      expect(softDeletedNote?.dirty).toBe(1);

      // VERIFICATION 6: Brand new server entities are inserted locally
      const brandNewTask = finalTasks.find((t) => t.id === "task-brand-new-from-server");
      expect(brandNewTask).toBeDefined();
      expect(brandNewTask?.title).toBe("New Task From Cloud");
      expect(brandNewTask?.dirty).toBe(0);
    });
  });
});
