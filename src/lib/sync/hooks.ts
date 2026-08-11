"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db, type SyncTask, type SyncCourse, type SyncNote, type SyncRoutine, type SyncEvent } from "./db";
import { useCallback } from "react";

// ─── Read hooks (live queries from Dexie) ──────────────────

export function useTasks(filters?: {
  courseId?: string;
  projectId?: string;
  status?: "open" | "done" | "all";
  starred?: boolean;
}): SyncTask[] {
  const tasks = useLiveQuery(async () => {
    let collection = db.tasks.where("_deleted").equals(0);

    if (filters?.status && filters.status !== "all") {
      collection = db.tasks.where("status").equals(filters.status);
      // Re-apply _deleted filter for compound queries
      const all = await collection.toArray();
      return all
        .filter((t) => t._deleted === 0)
        .filter((t) => !filters?.courseId || t.courseId === filters.courseId)
        .filter((t) => !filters?.projectId || t.projectId === filters.projectId)
        .filter((t) => filters?.starred === undefined || t.starred === filters.starred)
        .sort(taskSort);
    }

    const all = await collection.toArray();
    return all
      .filter((t) => !filters?.courseId || t.courseId === filters.courseId)
      .filter((t) => !filters?.projectId || t.projectId === filters.projectId)
      .filter((t) => filters?.status === "all" || !filters?.status || t.status === filters.status)
      .filter((t) => filters?.starred === undefined || t.starred === filters.starred)
      .sort(taskSort);
  }, [filters?.courseId, filters?.projectId, filters?.status, filters?.starred]) ?? [];

  return tasks;
}

export function useTaskById(id: string): SyncTask | undefined {
  return useLiveQuery(async () => {
    const task = await db.tasks.get(id);
    if (!task || task._deleted) return undefined;
    return task;
  }, [id]);
}

export function useOpenTasks(): SyncTask[] {
  return useLiveQuery(async () => {
    const tasks = await db.tasks.where("status").equals("open").toArray();
    return tasks.filter((t) => t._deleted === 0).sort(taskSort);
  }) ?? [];
}

export function useStarredTasks(): SyncTask[] {
  return useLiveQuery(async () => {
    const tasks = await db.tasks.where("starred").equals(1).toArray();
    return tasks
      .filter((t) => t._deleted === 0 && t.status === "open")
      .sort(taskSort)
      .slice(0, 3);
  }) ?? [];
}

export function useCourses(filters?: { semesterId?: string }): SyncCourse[] {
  return useLiveQuery(async () => {
    let courses = await db.courses.where("_deleted").equals(0).toArray();
    if (filters?.semesterId) {
      courses = courses.filter((c) => c.semesterId === filters.semesterId);
    }
    return courses.sort((a, b) => a.name.localeCompare(b.name));
  }, [filters?.semesterId]) ?? [];
}

export function useCourseById(id: string): SyncCourse | undefined {
  return useLiveQuery(async () => {
    const course = await db.courses.get(id);
    if (!course || course._deleted) return undefined;
    return course;
  }, [id]);
}

export function useNotes(filters?: {
  courseId?: string;
  folderId?: string;
  isDocumentLibraryEntry?: boolean;
  search?: string;
}): SyncNote[] {
  return useLiveQuery(async () => {
    let notes = await db.notes.where("_deleted").equals(0).toArray();

    if (filters?.courseId) {
      notes = notes.filter((n) => n.courseId === filters.courseId);
    }
    if (filters?.folderId) {
      notes = notes.filter((n) => n.folderId === filters.folderId);
    }
    if (filters?.isDocumentLibraryEntry !== undefined) {
      notes = notes.filter((n) => n.isDocumentLibraryEntry === filters.isDocumentLibraryEntry);
    }
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      notes = notes.filter(
        (n) =>
          n.title?.toLowerCase().includes(q) ||
          n.content.toLowerCase().includes(q)
      );
    }

    return notes.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [filters?.courseId, filters?.folderId, filters?.isDocumentLibraryEntry, filters?.search]) ?? [];
}

export function useNoteById(id: string): SyncNote | undefined {
  return useLiveQuery(async () => {
    const note = await db.notes.get(id);
    if (!note || note._deleted) return undefined;
    return note;
  }, [id]);
}

export function useRoutines(): SyncRoutine[] {
  return useLiveQuery(async () => {
    return db.routines.where("_deleted").equals(0).toArray();
  }) ?? [];
}

export function useEvents(filters?: { from?: string; to?: string }): SyncEvent[] {
  return useLiveQuery(async () => {
    let events = await db.events.where("_deleted").equals(0).toArray();

    if (filters?.from) {
      events = events.filter((e) => e.dateTime >= filters.from!);
    }
    if (filters?.to) {
      events = events.filter((e) => e.dateTime <= filters.to!);
    }

    return events.sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime());
  }, [filters?.from, filters?.to]) ?? [];
}

export function useRoutineCompletions(routineId: string): { date: string; completedAt: string }[] {
  return useLiveQuery(async () => {
    return db.routineCompletions
      .where("routineId")
      .equals(routineId)
      .toArray();
  }, [routineId]) ?? [];
}

// ─── Write helpers (instant Dexie write + background API sync) ──

function generateId(): string {
  return crypto.randomUUID();
}

function nowIso(): string {
  return new Date().toISOString();
}

export function useCreateTask() {
  return useCallback(async (data: {
    title: string;
    notes?: string;
    dueDate?: string;
    priority?: number;
    courseId?: string;
    projectId?: string;
    starred?: boolean;
    estimatedDuration?: number;
    optimalTimeOfDay?: string;
  }) => {
    const id = generateId();
    const updatedAt = nowIso();

    // Resolve denormalized course/project names
    let courseName: string | null = null;
    let courseColor: string | null = null;
    if (data.courseId) {
      const course = await db.courses.get(data.courseId);
      if (course) {
        courseName = course.name;
        courseColor = course.color;
      }
    }
    let projectName: string | null = null;
    let projectColor: string | null = null;

    const task: SyncTask = {
      id,
      userId: null, // Server sets this
      title: data.title,
      notes: data.notes ?? null,
      dueDate: data.dueDate ?? null,
      priority: data.priority ?? 2,
      status: "open",
      courseId: data.courseId ?? null,
      projectId: data.projectId ?? null,
      domainId: null,
      starred: data.starred ?? false,
      completedAt: null,
      energyRequirement: null,
      estimatedDuration: data.estimatedDuration ?? null,
      optimalTimeOfDay: data.optimalTimeOfDay ?? null,
      sortPriority: null,
      createdAt: updatedAt,
      updatedAt,
      courseName,
      courseColor,
      projectName,
      projectColor,
      dirty: 1,
      _deleted: 0,
    };

    await db.tasks.put(task);

    // Background API sync
    fetch("/api/sync/write", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: "tasks", action: "upsert", data: task }),
    })
      .then((r) => r.json())
      .then((serverTask) => {
        db.tasks.update(id, { dirty: 0, updatedAt: serverTask.updatedAt });
      })
      .catch(() => {}); // Will retry via pushDirtyRows

    return id;
  }, []);
}

export function useUpdateTask() {
  return useCallback(async (id: string, data: Partial<Omit<SyncTask, "id" | "createdAt" | "dirty" | "_deleted">>) => {
    const existing = await db.tasks.get(id);
    if (!existing) return;

    const updatedAt = nowIso();
    await db.tasks.update(id, { ...data, updatedAt, dirty: 1 });

    // Background API sync
    fetch("/api/sync/write", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: "tasks", action: "upsert", data: { id, ...data, updatedAt } }),
    })
      .then((r) => r.json())
      .then((serverTask) => {
        db.tasks.update(id, { dirty: 0, updatedAt: serverTask.updatedAt });
      })
      .catch(() => {});
  }, []);
}

export function useDeleteTask() {
  return useCallback(async (id: string) => {
    // Soft-delete locally
    await db.tasks.update(id, { _deleted: 1, dirty: 1, updatedAt: nowIso() });

    // Background API sync
    fetch("/api/sync/write", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: "tasks", action: "delete", data: { id } }),
    })
      .then(() => {
        db.tasks.delete(id); // Hard delete after successful API call
      })
      .catch(() => {}); // Will retry via pushDirtyRows
  }, []);
}

export function useToggleTaskDone() {
  return useCallback(async (id: string) => {
    const task = await db.tasks.get(id);
    if (!task) return;

    const newStatus = task.status === "done" ? "open" : "done";
    const updatedAt = nowIso();
    const completedAt = newStatus === "done" ? updatedAt : null;

    await db.tasks.update(id, {
      status: newStatus,
      completedAt,
      updatedAt,
      dirty: 1,
    });

    fetch("/api/sync/write", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        table: "tasks",
        action: "upsert",
        data: { id, status: newStatus, completedAt, updatedAt },
      }),
    })
      .then((r) => r.json())
      .then((serverTask) => {
        db.tasks.update(id, { dirty: 0, updatedAt: serverTask.updatedAt });
      })
      .catch(() => {});
  }, []);
}

export function useToggleTaskStarred() {
  return useCallback(async (id: string) => {
    const task = await db.tasks.get(id);
    if (!task) return;

    const updatedAt = nowIso();
    await db.tasks.update(id, {
      starred: !task.starred,
      updatedAt,
      dirty: 1,
    });

    fetch("/api/sync/write", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        table: "tasks",
        action: "upsert",
        data: { id, starred: !task.starred, updatedAt },
      }),
    })
      .then((r) => r.json())
      .then((serverTask) => {
        db.tasks.update(id, { dirty: 0, updatedAt: serverTask.updatedAt });
      })
      .catch(() => {});
  }, []);
}

// ─── Notes write hooks ──────────────────────────────────────

export function useCreateNote() {
  return useCallback(async (data: {
    title?: string;
    content: string;
    sourceType?: string;
    tags?: string[];
    courseId?: string;
    taskId?: string;
    projectId?: string;
    folderId?: string | null;
  }) => {
    const id = generateId();
    const updatedAt = nowIso();

    let courseName: string | null = null;
    let courseColor: string | null = null;
    if (data.courseId) {
      const course = await db.courses.get(data.courseId);
      if (course) {
        courseName = course.name;
        courseColor = course.color;
      }
    }

    const note: SyncNote = {
      id,
      userId: null,
      title: data.title ?? null,
      content: data.content,
      sourceType: data.sourceType ?? "typed",
      sourceLink: null,
      tags: data.tags ?? [],
      courseId: data.courseId ?? null,
      taskId: data.taskId ?? null,
      projectId: data.projectId ?? null,
      isDocumentLibraryEntry: false,
      folderId: data.folderId ?? null,
      documentType: null,
      s3Key: null,
      s3Url: null,
      fileSize: null,
      fileName: null,
      mimeType: null,
      pageCount: null,
      thumbnailUrl: null,
      originalUrl: null,
      embedHtml: null,
      extractedText: null,
      lastViewedAt: null,
      viewCount: 0,
      isPinned: false,
      isFavorite: false,
      lastReviewedAt: null,
      reviewCount: 0,
      createdAt: updatedAt,
      updatedAt,
      courseName,
      courseColor,
      folderName: null,
      folderType: null,
      folderColor: null,
      dirty: 1,
      _deleted: 0,
    };

    await db.notes.put(note);

    fetch("/api/sync/write", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: "notes", action: "upsert", data: note }),
    })
      .then((r) => r.json())
      .then((serverNote) => {
        db.notes.update(id, { dirty: 0, updatedAt: serverNote.updatedAt });
      })
      .catch(() => {});

    return id;
  }, []);
}

export function useUpdateNote() {
  return useCallback(async (id: string, data: Partial<Omit<SyncNote, "id" | "createdAt" | "dirty" | "_deleted">>) => {
    const updatedAt = nowIso();
    await db.notes.update(id, { ...data, updatedAt, dirty: 1 });

    fetch("/api/sync/write", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: "notes", action: "upsert", data: { id, ...data, updatedAt } }),
    })
      .then((r) => r.json())
      .then((serverNote) => {
        db.notes.update(id, { dirty: 0, updatedAt: serverNote.updatedAt });
      })
      .catch(() => {});
  }, []);
}

export function useDeleteNote() {
  return useCallback(async (id: string) => {
    await db.notes.update(id, { _deleted: 1, dirty: 1, updatedAt: nowIso() });

    fetch("/api/sync/write", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: "notes", action: "delete", data: { id } }),
    })
      .then(() => {
        db.notes.delete(id);
      })
      .catch(() => {});
  }, []);
}

// ─── Course write hooks ─────────────────────────────────────

export function useCreateCourse() {
  return useCallback(async (data: {
    semesterId: string;
    name: string;
    code?: string;
    credits: number;
    instructor?: string;
    color?: string;
    targetGrade?: string;
  }) => {
    const id = generateId();
    const updatedAt = nowIso();

    const course: SyncCourse = {
      id,
      semesterId: data.semesterId,
      name: data.name,
      code: data.code ?? null,
      credits: data.credits,
      instructor: data.instructor ?? null,
      color: data.color ?? null,
      targetGrade: data.targetGrade ?? null,
      attendanceMode: "auto",
      manualPresent: null,
      manualTotalClasses: null,
      createdAt: updatedAt,
      updatedAt,
      dirty: 1,
      _deleted: 0,
    };

    await db.courses.put(course);

    fetch("/api/sync/write", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: "courses", action: "upsert", data: course }),
    })
      .then((r) => r.json())
      .then((serverCourse) => {
        db.courses.update(id, { dirty: 0, updatedAt: serverCourse.updatedAt });
      })
      .catch(() => {});

    return id;
  }, []);
}

export function useUpdateCourse() {
  return useCallback(async (id: string, data: Partial<Omit<SyncCourse, "id" | "createdAt" | "dirty" | "_deleted">>) => {
    const updatedAt = nowIso();
    await db.courses.update(id, { ...data, updatedAt, dirty: 1 });

    fetch("/api/sync/write", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: "courses", action: "upsert", data: { id, ...data, updatedAt } }),
    })
      .then((r) => r.json())
      .then((serverCourse) => {
        db.courses.update(id, { dirty: 0, updatedAt: serverCourse.updatedAt });
      })
      .catch(() => {});
  }, []);
}

export function useDeleteCourse() {
  return useCallback(async (id: string) => {
    await db.courses.update(id, { _deleted: 1, dirty: 1, updatedAt: nowIso() });

    fetch("/api/sync/write", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: "courses", action: "delete", data: { id } }),
    })
      .then(() => {
        db.courses.delete(id);
      })
      .catch(() => {});
  }, []);
}

// ─── Event write hooks ──────────────────────────────────────

export function useCreateEvent() {
  return useCallback(async (data: {
    title: string;
    dateTime: string;
    endTime?: string;
    location?: string;
    notes?: string;
    eventType?: string;
    recurrenceRule?: string;
    recurrenceEnd?: string;
    parentEventId?: string;
  }) => {
    const id = generateId();
    const createdAt = nowIso();

    const event: SyncEvent = {
      id,
      userId: null,
      title: data.title,
      dateTime: data.dateTime,
      endTime: data.endTime ?? null,
      location: data.location ?? null,
      notes: data.notes ?? null,
      eventType: data.eventType ?? "general",
      recurrenceRule: data.recurrenceRule ?? null,
      recurrenceEnd: data.recurrenceEnd ?? null,
      parentEventId: data.parentEventId ?? null,
      createdAt,
      updatedAt: createdAt,
      dirty: 1,
      _deleted: 0,
    };

    await db.events.put(event);

    fetch("/api/sync/write", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: "events", action: "upsert", data: event }),
    })
      .then((r) => r.json())
      .then((serverEvent) => {
        db.events.update(id, { dirty: 0 });
      })
      .catch(() => {});

    return id;
  }, []);
}

export function useDeleteEvent() {
  return useCallback(async (id: string) => {
    await db.events.update(id, { _deleted: 1, dirty: 1 });

    fetch("/api/sync/write", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: "events", action: "delete", data: { id } }),
    })
      .then(() => {
        db.events.delete(id);
      })
      .catch(() => {});
  }, []);
}

// ─── Routine write hooks ────────────────────────────────────

export function useCreateRoutine() {
  return useCallback(async (data: {
    name: string;
    timeOfDay: string;
    specificTime?: string;
    activeDays?: string[];
    identityId?: string;
  }) => {
    const id = generateId();
    const updatedAt = nowIso();

    const routine: SyncRoutine = {
      id,
      userId: null,
      name: data.name,
      timeOfDay: data.timeOfDay,
      specificTime: data.specificTime ?? null,
      streakGoal: null,
      activeDays: data.activeDays ?? [],
      energyImpact: "neutral",
      category: null,
      flowTrigger: null,
      identityId: data.identityId ?? null,
      createdAt: updatedAt,
      updatedAt,
      dirty: 1,
      _deleted: 0,
    };

    await db.routines.put(routine);

    fetch("/api/sync/write", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: "routines", action: "upsert", data: routine }),
    })
      .then((r) => r.json())
      .then((serverRoutine) => {
        db.routines.update(id, { dirty: 0, updatedAt: serverRoutine.updatedAt });
      })
      .catch(() => {});

    return id;
  }, []);
}

export function useDeleteRoutine() {
  return useCallback(async (id: string) => {
    await db.routines.update(id, { _deleted: 1, dirty: 1, updatedAt: nowIso() });

    fetch("/api/sync/write", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: "routines", action: "delete", data: { id } }),
    })
      .then(() => {
        db.routines.delete(id);
      })
      .catch(() => {});
  }, []);
}

// ─── Sort helpers ───────────────────────────────────────────

function taskSort(a: SyncTask, b: SyncTask): number {
  // Sort by sortPriority (nulls last), then priority, then dueDate
  if (a.sortPriority !== null && b.sortPriority !== null) {
    return a.sortPriority - b.sortPriority;
  }
  if (a.sortPriority !== null) return -1;
  if (b.sortPriority !== null) return 1;

  if (a.priority !== b.priority) return a.priority - b.priority;

  if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
  if (a.dueDate) return -1;
  if (b.dueDate) return 1;

  return 0;
}
