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
  energyRequirement: string | null;
  estimatedDuration: number | null;
  optimalTimeOfDay: string | null;
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
  energyImpact: string;
  category: string | null;
  flowTrigger: string | null;
  identityId: string | null;
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
  location: string | null;
  notes: string | null;
  eventType: string | null;
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

// ─── Database ──────────────────────────────────────────────

class SyncDatabase extends Dexie {
  tasks!: Table<SyncTask, string>;
  courses!: Table<SyncCourse, string>;
  notes!: Table<SyncNote, string>;
  routines!: Table<SyncRoutine, string>;
  events!: Table<SyncEvent, string>;
  routineCompletions!: Table<SyncRoutineCompletion, string>;

  constructor() {
    super("AcademicCommandCenter");

    this.version(1).stores({
      tasks: "id, userId, status, courseId, projectId, starred, dirty, _deleted, [userId+status], [userId+courseId]",
      courses: "id, semesterId, dirty, _deleted",
      notes: "id, userId, courseId, taskId, projectId, folderId, isDocumentLibraryEntry, dirty, _deleted, [userId+courseId]",
      routines: "id, userId, identityId, dirty, _deleted",
      events: "id, userId, dateTime, eventType, dirty, _deleted",
      routineCompletions: "id, routineId, date, [routineId+date]",
    });
  }
}

export const db = new SyncDatabase();
