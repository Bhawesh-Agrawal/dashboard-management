import { db, type SyncTask, type SyncCourse, type SyncNote, type SyncRoutine, type SyncEvent, type SyncAttendanceRecord, type SyncClassSchedule, type SyncAssessment } from "./db";

// ─── Sync Manager ──────────────────────────────────────────
// Orchestrates local-first data flow: Dexie ↔ API ↔ Supabase Realtime.

type SyncableTable = "tasks" | "courses" | "notes" | "routines" | "events" | "attendance" | "classSchedules" | "assessments";

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

  // ─── Seed: Full pull from API → Dexie ──────────────────────

  async seedAll(): Promise<void> {
    if (this._isSeeding) return;
    this._isSeeding = true;

    try {
      const response = await fetch("/api/sync/seed", { credentials: "include" });
      if (!response.ok) throw new Error(`Seed failed: ${response.status}`);

      const data = await response.json();

      // Clear existing data for clean seed
      await db.tasks.clear();
      await db.courses.clear();
      await db.notes.clear();
      await db.routines.clear();
      await db.events.clear();
      await db.routineCompletions.clear();
      await db.attendance.clear();
      await db.classSchedules.clear();
      await db.assessments.clear();

      // Upsert seed data
      if (data.tasks?.length) {
        await db.tasks.bulkPut(
          data.tasks.map((t: SyncTask) => ({ ...t, dirty: 0, _deleted: 0 }))
        );
      }
      if (data.courses?.length) {
        await db.courses.bulkPut(
          data.courses.map((c: SyncCourse) => ({ ...c, dirty: 0, _deleted: 0 }))
        );
      }
      if (data.notes?.length) {
        await db.notes.bulkPut(
          data.notes.map((n: SyncNote) => ({ ...n, dirty: 0, _deleted: 0 }))
        );
      }
      if (data.routines?.length) {
        await db.routines.bulkPut(
          data.routines.map((r: SyncRoutine) => ({ ...r, dirty: 0, _deleted: 0 }))
        );
      }
      if (data.events?.length) {
        await db.events.bulkPut(
          data.events.map((e: SyncEvent) => ({ ...e, dirty: 0, _deleted: 0 }))
        );
      }
      if (data.routineCompletions?.length) {
        await db.routineCompletions.bulkPut(data.routineCompletions);
      }
      // Seed extended tables
      if (data.attendance?.length) {
        await db.attendance.bulkPut(
          data.attendance.map((a: SyncAttendanceRecord) => ({ ...a, dirty: 0, _deleted: 0 }))
        );
      }
      if (data.classSchedules?.length) {
        await db.classSchedules.bulkPut(
          data.classSchedules.map((cs: SyncClassSchedule) => ({ ...cs, dirty: 0, _deleted: 0 }))
        );
      }
      if (data.assessments?.length) {
        await db.assessments.bulkPut(
          data.assessments.map((a: SyncAssessment) => ({ ...a, dirty: 0, _deleted: 0 }))
        );
      }
    } catch (error) {
      console.error("[SyncManager] Seed failed:", error);
      throw error;
    } finally {
      this._isSeeding = false;
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
        this.pushDirtyAttendance(),
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
}

// Singleton
export const syncManager = new SyncManager();