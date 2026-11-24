import Dexie, { type Table } from "dexie";

// ─── Mirror types (Prisma fields + sync metadata) ──────────

export interface SyncTask {
  id: string;
  userId: string | null;
  title: string;
  notes: string | null;
  dueDate: string | null; // ISO string
  priority: number;
  status: "open" | "done";
  courseId: string | null;
  projectId: string | null;
  domainId: string | null;
  starred: boolean;
  completedAt: string | null;
  estimatedDuration: number | null;
  sortPriority: number | null;
  createdAt: string;
  updatedAt: string;
  // Denormalized join data for display
  courseName: string | null;
  courseColor: string | null;
  projectName: string | null;
  projectColor: string | null;
  // Sync metadata
  dirty: 0 | 1;
  _deleted: 0 | 1;
}

export interface SyncCourse {
  id: string;
  semesterId: string;
  name: string;
  code: string | null;
  credits: number;
  instructor: string | null;
  color: string | null;
  targetGrade: string | null;
  attendanceMode: "auto" | "manual" | null;
  manualPresent: number | null;
  manualTotalClasses: number | null;
  createdAt: string;
  updatedAt: string;
  // Sync metadata
  dirty: 0 | 1;
  _deleted: 0 | 1;
}

export interface SyncNote {
  id: string;
  userId: string | null;
  title: string | null;
  content: string;
  sourceType: string;
  sourceLink: string | null;
  tags: string[];
  courseId: string | null;
  taskId: string | null;
  projectId: string | null;
  isDocumentLibraryEntry: boolean;
  folderId: string | null;
  documentType: string | null;
  s3Key: string | null;
  s3Url: string | null;
  fileSize: number | null;
  fileName: string | null;
  mimeType: string | null;
  pageCount: number | null;
  thumbnailUrl: string | null;
  originalUrl: string | null;
  embedHtml: string | null;
  extractedText: string | null;
  lastViewedAt: string | null;
  viewCount: number;
  isPinned: boolean;
  isFavorite: boolean;
  lastReviewedAt: string | null;
  reviewCount: number;
  createdAt: string;
  updatedAt: string;
  // Denormalized join data
  courseName: string | null;
  courseColor: string | null;
  folderName: string | null;
  folderType: string | null;
  folderColor: string | null;
  // Sync metadata
  dirty: 0 | 1;
  _deleted: 0 | 1;
}

export interface SyncRoutine {
  id: string;
  userId: string | null;
  name: string;
  timeOfDay: string;
  specificTime: string | null;
  streakGoal: number | null;
  activeDays: string[];
  category: string | null;
  flowTrigger: string | null;
  createdAt: string;
  updatedAt: string;
  // Sync metadata
  dirty: 0 | 1;
  _deleted: 0 | 1;
}

export interface SyncEvent {
  id: string;
  userId: string | null;
  title: string;
  dateTime: string; // ISO string
  endTime: string | null; // ISO string for event end time
  location: string | null;
  notes: string | null;
  eventType: string | null;
  // Recurring event support
  recurrenceRule: string | null; // iCal RRULE format
  recurrenceEnd: string | null; // ISO string when recurrence stops
  parentEventId: string | null; // Link to parent event for instances
  createdAt: string;
  updatedAt: string;
  // Sync metadata
  dirty: 0 | 1;
  _deleted: 0 | 1;
}

export interface SyncRoutineCompletion {
  id: string;
  routineId: string;
  date: string; // ISO date string (YYYY-MM-DD)
  completedAt: string;
}

// ─── Extended sync types for caching ────────────────────────

export interface SyncAttendanceRecord {
  id: string;
  courseId: string;
  date: string; // ISO date string (YYYY-MM-DD)
  status: "present" | "absent" | "cancelled" | "not_marked";
  // Sync metadata
  dirty: 0 | 1;
  _deleted: 0 | 1;
}

export interface SyncClassSchedule {
  id: string;
  courseId: string;
  dayOfWeek: string; // "MON", "TUE", etc.
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
  location: string | null;
  effectiveStartDate: string | null;
  effectiveEndDate: string | null;
  // Denormalized course data
  courseName: string;
  courseCode: string | null;
  courseColor: string | null;
  // Sync metadata
  dirty: 0 | 1;
  _deleted: 0 | 1;
}

export interface SyncAssessment {
  id: string;
  courseId: string;
  componentType: string;
  date: string | null;
  maxMarks: number;
  obtainedMarks: number | null;
  // Denormalized course data
  courseName: string;
  courseColor: string | null;
  // Sync metadata
  dirty: 0 | 1;
  _deleted: 0 | 1;
}

// ─── Database ──────────────────────────────────────────────

class SyncDatabase extends Dexie {
  tasks!: Table<SyncTask, string>;
  courses!: Table<SyncCourse, string>;
  notes!: Table<SyncNote, string>;
  routines!: Table<SyncRoutine, string>;
  events!: Table<SyncEvent, string>;
  routineCompletions!: Table<SyncRoutineCompletion, string>;
  // Extended tables for better caching
  attendance!: Table<SyncAttendanceRecord, string>;
  classSchedules!: Table<SyncClassSchedule, string>;
  assessments!: Table<SyncAssessment, string>;

  constructor() {
    super("AcademicCommandCenter");

    this.version(2).stores({
      tasks: "id, userId, status, courseId, projectId, starred, dirty, _deleted, [userId+status], [userId+courseId]",
      courses: "id, semesterId, dirty, _deleted",
      notes: "id, userId, courseId, taskId, projectId, folderId, isDocumentLibraryEntry, dirty, _deleted, [userId+courseId]",
      routines: "id, userId, identityId, dirty, _deleted",
      events: "id, userId, dateTime, eventType, parentEventId, dirty, _deleted",
      routineCompletions: "id, routineId, date, [routineId+date]",
      attendance: "id, courseId, date, status, dirty, _deleted, [courseId+date]",
      classSchedules: "id, courseId, dayOfWeek, dirty, _deleted, [courseId+dayOfWeek]",
      assessments: "id, courseId, date, dirty, _deleted, [courseId+date]",
    });

    this.version(3)
      .stores({
        routines: "id, userId, dirty, _deleted",
      })
      .upgrade(upgradeV2ToV3);
  }
}

/**
 * Migration handler from schema v2 to v3:
 * - Drops removed columns (energyRequirement, optimalTimeOfDay) from tasks
 * - Drops removed columns (identityId, energyImpact) from routines
 * - Removes identityId index from routines table
 * - Preserves all stored data for kept tables and columns
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function upgradeV2ToV3(tx: any) {
  // Drop removed columns from tasks
  await tx
    .table("tasks")
    .toCollection()
    .modify((task: Record<string, unknown>) => {
      delete task.energyRequirement;
      delete task.optimalTimeOfDay;
    });

  // Drop removed columns from routines
  await tx
    .table("routines")
    .toCollection()
    .modify((routine: Record<string, unknown>) => {
      delete routine.identityId;
      delete routine.energyImpact;
    });
}

export const db = new SyncDatabase();
