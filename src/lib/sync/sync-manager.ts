import { db, type SyncTask, type SyncCourse, type SyncNote, type SyncRoutine, type SyncEvent, type SyncAttendanceRecord, type SyncClassSchedule, type SyncAssessment } from "./db";

// ─── Sync Manager ──────────────────────────────────────────
// Orchestrates local-first data flow: Dexie ↔ API ↔ Supabase Realtime.

type SyncableTable = "tasks" | "courses" | "notes" | "routines" | "events" | "attendance" | "classSchedules" | "assessments";

/**
 * Checks whether a local entity has unpushed modifications or is in a pending sync state.
 * Real schema dirty markers:
 * - dirty === 1: row was created or updated locally while offline/unsaved
 * - _deleted === 1: row was marked for deletion locally while offline/unsaved
 * - pendingQueueIds: row ID is referenced in an active mutation queue
 */
export function isEntityDirty(
  entity: { id?: string; dirty?: number | boolean; _deleted?: number | boolean } | null | undefined,
  pendingQueueIds?: Set<string>
): boolean {
  if (!entity) return false;
  if (entity.dirty === 1 || entity.dirty === true) return true;
  if (entity._deleted === 1 || entity._deleted === true) return true;
  if (pendingQueueIds && entity.id && pendingQueueIds.has(entity.id)) return true;
  return false;
}

class SyncManager {
  private _isSeeding = false;
  private _isPushing = false;
  private _realtimeUnsubscribe: (() => void) | null = null;

  get isSeeding() {
    return this._isSeeding;
  }

  get isPushing() {
    return this._isPushing;
  }

  // ─── Seed: Pull from API → Dexie preserving dirty/unsynced rows ──

  async seedAll(): Promise<void> {
    if (this._isSeeding) return;
    this._isSeeding = true;

    try {
      const response = await fetch("/api/sync/seed", { credentials: "include" });
      if (!response.ok) throw new Error(`Seed failed: ${response.status}`);

      const data = await response.json();

      // Collect pending mutations in syncQueue if defined
      const pendingQueueIds = new Set<string>();
      try {
        if ("syncQueue" in db && typeof (db as any).syncQueue?.toArray === "function") {
          const queueItems = await (db as any).syncQueue.toArray();
          for (const item of queueItems) {
            if (item.entityId) pendingQueueIds.add(item.entityId);
            if (item.id) pendingQueueIds.add(item.id);
          }
        }
      } catch {
        // Ignore if syncQueue table is not defined
      }

      // Seed tables while preserving dirty / unsynced rows
      await this.seedTable("tasks", data.tasks, pendingQueueIds);
      await this.seedTable("courses", data.courses, pendingQueueIds);
      await this.seedTable("notes", data.notes, pendingQueueIds);
      await this.seedTable("routines", data.routines, pendingQueueIds);
      await this.seedTable("events", data.events, pendingQueueIds);

      // Handle routineCompletions preserving dirty/pending
      const localCompletions = await db.routineCompletions.toArray();
      const dirtyCompletions = localCompletions.filter((r) => isEntityDirty(r, pendingQueueIds));
      const dirtyCompletionIds = new Set(dirtyCompletions.map((r: any) => r.id));
      const cleanCompletionIds = localCompletions
        .filter((r: any) => !dirtyCompletionIds.has(r.id))
        .map((r: any) => r.id);
      if (cleanCompletionIds.length > 0) {
        await db.routineCompletions.bulkDelete(cleanCompletionIds);
      }
      if (data.routineCompletions?.length) {
        const completionsToInsert = data.routineCompletions.filter(
          (rc: any) => !dirtyCompletionIds.has(rc.id)
        );
        if (completionsToInsert.length > 0) {
          await db.routineCompletions.bulkPut(completionsToInsert);
        }
      }

      // Extended tables
      await this.seedTable("attendance", data.attendance, pendingQueueIds);
      await this.seedTable("classSchedules", data.classSchedules, pendingQueueIds);
      await this.seedTable("assessments", data.assessments, pendingQueueIds);
    } catch (error) {
      console.error("[SyncManager] Seed failed:", error);
      throw error;
    } finally {
      this._isSeeding = false;
    }
  }

  private async seedTable<T extends { id: string }>(
    tableName: SyncableTable,
    serverRows: T[] | undefined,
    pendingQueueIds: Set<string>
  ): Promise<void> {
    const table = db[tableName];
    const localRows = await table.toArray();
    const dirtyRows = localRows.filter((r) => isEntityDirty(r, pendingQueueIds));
    const dirtyIds = new Set(dirtyRows.map((r: any) => r.id));

    // Clear only clean, non-dirty rows
    const cleanIds = localRows.filter((r: any) => !dirtyIds.has(r.id)).map((r: any) => r.id);
    if (cleanIds.length > 0) {
      await (table as any).bulkDelete(cleanIds);
    }

    // Upsert seed data for rows that are NOT locally dirty/unsynced
    if (serverRows?.length) {
      const rowsToInsert = serverRows
        .filter((row) => !dirtyIds.has(row.id))
        .map((row) => ({ ...row, dirty: 0, _deleted: 0 } as any));
      if (rowsToInsert.length > 0) {
        await (table as any).bulkPut(rowsToInsert);
      }
    }
  }

  // ─── Push: Sweep dirty rows and retry API writes ───────────

  async pushDirtyRows(): Promise<void> {
    if (this._isPushing || !navigator.onLine) return;
    this._isPushing = true;

    try {
      await Promise.all([
        this.pushDirtyTasks(),
        this.pushDirtyCourses(),
        this.pushDirtyNotes(),
        this.pushDirtyRoutines(),
        this.pushDirtyEvents(),
        // Attendance marking is online-only; not pushed via sync queue
        this.pushDirtyClassSchedules(),
        this.pushDirtyAssessments(),
      ]);
    } finally {
      this._isPushing = false;
    }
  }

  private async pushDirtyTasks(): Promise<void> {
    const dirtyTasks = await db.tasks.where("dirty").equals(1).toArray();
    for (const task of dirtyTasks) {
      try {
        if (task._deleted) {
          await this.apiDelete("tasks", task.id);
          await db.tasks.delete(task.id);
        } else {
          const serverTask = await this.apiWrite("tasks", task);
          await db.tasks.update(task.id, {
            dirty: 0,
            updatedAt: serverTask.updatedAt,
          });
        }
      } catch {
        // Will retry on next push cycle
      }
    }
  }

  private async pushDirtyCourses(): Promise<void> {
    const dirty = await db.courses.where("dirty").equals(1).toArray();
    for (const item of dirty) {
      try {
        if (item._deleted) {
          await this.apiDelete("courses", item.id);
          await db.courses.delete(item.id);
        } else {
          const serverItem = await this.apiWrite("courses", item);
          await db.courses.update(item.id, {
            dirty: 0,
            updatedAt: serverItem.updatedAt,
          });
        }
      } catch {
        // Will retry
      }
    }
  }

  private async pushDirtyNotes(): Promise<void> {
    const dirty = await db.notes.where("dirty").equals(1).toArray();
    for (const item of dirty) {
      try {
        if (item._deleted) {
          await this.apiDelete("notes", item.id);
          await db.notes.delete(item.id);
        } else {
          const serverItem = await this.apiWrite("notes", item);
          await db.notes.update(item.id, {
            dirty: 0,
            updatedAt: serverItem.updatedAt,
          });
        }
      } catch {
        // Will retry
      }
    }
  }

  private async pushDirtyRoutines(): Promise<void> {
    const dirty = await db.routines.where("dirty").equals(1).toArray();
    for (const item of dirty) {
      try {
        if (item._deleted) {
          await this.apiDelete("routines", item.id);
          await db.routines.delete(item.id);
        } else {
          const serverItem = await this.apiWrite("routines", item);
          await db.routines.update(item.id, {
            dirty: 0,
            updatedAt: serverItem.updatedAt,
          });
        }
      } catch {
        // Will retry
      }
    }
  }

  private async pushDirtyEvents(): Promise<void> {
    const dirty = await db.events.where("dirty").equals(1).toArray();
    for (const item of dirty) {
      try {
        if (item._deleted) {
          await this.apiDelete("events", item.id);
          await db.events.delete(item.id);
        } else {
          const serverItem = await this.apiWrite("events", item);
          await db.events.update(item.id, {
            dirty: 0,
            updatedAt: serverItem.updatedAt,
          });
        }
      } catch {
        // Will retry
      }
    }
  }

  private async pushDirtyAttendance(): Promise<void> {
    const dirty = await db.attendance.where("dirty").equals(1).toArray();
    for (const item of dirty) {
      try {
        if (item._deleted) {
          await this.apiDelete("attendance", item.id);
          await db.attendance.delete(item.id);
        } else {
          await this.apiWrite("attendance", item);
          await db.attendance.update(item.id, {
            dirty: 0,
          });
        }
      } catch {
        // Will retry
      }
    }
  }

  private async pushDirtyClassSchedules(): Promise<void> {
    const dirty = await db.classSchedules.where("dirty").equals(1).toArray();
    for (const item of dirty) {
      try {
        if (item._deleted) {
          await this.apiDelete("classSchedules", item.id);
          await db.classSchedules.delete(item.id);
        } else {
          await this.apiWrite("classSchedules", item);
          await db.classSchedules.update(item.id, {
            dirty: 0,
          });
        }
      } catch {
        // Will retry
      }
    }
  }

  private async pushDirtyAssessments(): Promise<void> {
    const dirty = await db.assessments.where("dirty").equals(1).toArray();
    for (const item of dirty) {
      try {
        if (item._deleted) {
          await this.apiDelete("assessments", item.id);
          await db.assessments.delete(item.id);
        } else {
          await this.apiWrite("assessments", item);
          await db.assessments.update(item.id, {
            dirty: 0,
          });
        }
      } catch {
        // Will retry
      }
    }
  }

  // ─── API helpers ───────────────────────────────────────────

  private async apiWrite(table: SyncableTable, data: unknown): Promise<{ updatedAt: string }> {
    const response = await fetch("/api/sync/write", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table, action: "upsert", data }),
    });
    if (!response.ok) throw new Error(`API write failed: ${response.status}`);
    return response.json();
  }

  private async apiDelete(table: SyncableTable, id: string): Promise<void> {
    const response = await fetch("/api/sync/write", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table, action: "delete", data: { id } }),
    });
    if (!response.ok) throw new Error(`API delete failed: ${response.status}`);
  }

  // ─── Realtime: Handle incoming changes from other devices ──

  async handleRealtimeEvent(
    table: SyncableTable,
    eventType: "INSERT" | "UPDATE" | "DELETE",
    record: Record<string, unknown>
  ): Promise<void> {
    const id = record.id as string;
    if (!id) return;

    const dexieTable = db[table];

    if (eventType === "DELETE") {
      const local = await dexieTable.get(id);
      if (local && !local.dirty) {
        await dexieTable.delete(id);
      }
      // If local has dirty changes, keep local (last-write-wins)
      return;
    }

    // INSERT or UPDATE
    const incoming = record as unknown as Record<string, unknown>;
    const incomingUpdatedAt = incoming.updatedAt as string | undefined;
    const local = await dexieTable.get(id);

    if (!local) {
      // New from another device — upsert
      await dexieTable.put({ ...incoming, dirty: 0, _deleted: 0 } as any);
    } else if (local.dirty) {
      // Local has unsynced changes — keep local if newer
      const localUpdatedAt = (local as unknown as Record<string, unknown>).updatedAt as string | undefined;
      if (incomingUpdatedAt && localUpdatedAt && new Date(incomingUpdatedAt) > new Date(localUpdatedAt)) {
        await dexieTable.put({ ...incoming, dirty: 0, _deleted: 0 } as any);
      }
      // Otherwise discard incoming
    } else {
      // No local changes — apply incoming
      await dexieTable.put({ ...incoming, dirty: 0, _deleted: 0 } as any);
    }
  }

  // ─── Cleanup ───────────────────────────────────────────────

  destroy(): void {
    this._realtimeUnsubscribe?.();
    this._realtimeUnsubscribe = null;
  }

  // ─── Pull: Smart merge from server → Dexie ───────────────
  // Pushes dirty rows first, then upserts server data without clearing local changes.

  async pullAll(): Promise<void> {
    if (this._isSeeding) return;
    this._isSeeding = true;

    try {
      // Push dirty rows first so server has latest local changes
      await this.pushDirtyRows();

      const response = await fetch("/api/sync/seed", { credentials: "include" });
      if (!response.ok) throw new Error(`Pull failed: ${response.status}`);

      const data = await response.json();

      // Smart merge: upsert server data, preserving local dirty rows
      await this.mergeTable("tasks", data.tasks);
      await this.mergeTable("courses", data.courses);
      await this.mergeTable("notes", data.notes);
      await this.mergeTable("routines", data.routines);
      await this.mergeTable("events", data.events);

      if (data.routineCompletions?.length) {
        await db.routineCompletions.bulkPut(data.routineCompletions);
      }
      await this.mergeTable("attendance", data.attendance);
      await this.mergeTable("classSchedules", data.classSchedules);
      await this.mergeTable("assessments", data.assessments);
    } catch (error) {
      console.error("[SyncManager] Pull failed:", error);
      throw error;
    } finally {
      this._isSeeding = false;
    }
  }

  private async mergeTable<T extends { id: string }>(
    tableName: SyncableTable,
    serverRows: T[] | undefined
  ): Promise<void> {
    if (!serverRows?.length) return;
    const table = db[tableName];

    for (const row of serverRows) {
      const local = await table.get(row.id);
      if (local && (local as any).dirty) {
        // Local has unsynced changes — skip this row (don't overwrite)
        continue;
      }
      // Upsert server data
      await table.put({ ...row, dirty: 0, _deleted: 0 } as any);
    }
  }
}

// Singleton
export const syncManager = new SyncManager();