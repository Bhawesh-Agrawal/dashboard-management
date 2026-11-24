import type {
  Semester,
  Course,
  ClassSchedule,
  AttendanceRecord,
  Assessment,
  Task,
  Note,
  NoteLink,
  GradingConfig,
  AttendanceMarksConfig,
  Project,
  NoteAttachment,
  DocumentFolder,
  NoteAnnotation,
  AttachmentType,
} from "@prisma/client";
import type { RoutineWithStreak } from "@/features/routines/types";

// ─── Semester with courses ──────────────────────────────────
export type SemesterWithCourses = Semester & {
  courses: Course[];
};

// ─── Course with full detail ────────────────────────────────
export type CourseWithDetails = Course & {
  classSchedules: ClassSchedule[];
  attendanceRecords: AttendanceRecord[];
  assessments: Assessment[];
  tasks: Task[];
  notes: Note[];
  gradingConfigs: GradingConfig[];
  attendanceMarksConfigs: AttendanceMarksConfig[];
};

// ─── Course summary (for lists) ─────────────────────────────
export type CourseSummary = Course & {
  _count: {
    tasks: number;
    notes: number;
  };
};

// ─── Task with optional course and project ──────────────────
export type TaskWithCourse = Task & {
  course: Pick<Course, "id" | "name" | "color"> | null;
  project: Pick<Project, "id" | "name" | "color"> | null;
};

// ─── Note with optional course ──────────────────────────────
export type NoteWithCourse = Note & {
  course: Pick<Course, "id" | "name" | "color"> | null;
  folder: Pick<DocumentFolder, "id" | "name" | "type" | "color"> | null;
  noteAttachments: NoteAttachment[];
};

export type NoteWithAnnotations = NoteWithCourse & {
  annotations: NoteAnnotation[];
};

// ─── Note with attachments ──────────────────────────────────
export type NoteWithAttachments = NoteWithCourse & {
  noteAttachments: NoteAttachment[];
};

// ─── Dashboard data ─────────────────────────────────────────
export type DashboardData = {
  topTasks: TaskWithCourse[];
  allOpenTasks: TaskWithCourse[];
  todayClasses: (ClassSchedule & { course: Pick<Course, "id" | "name" | "color" | "code">; exceptions?: any[] })[];
  upcomingDeadlines: {
    id: string;
    title: string;
    date: Date;
    type: "assessment" | "task" | "event" | "birthday";
    courseName?: string;
    courseColor?: string;
    projectName?: string;
    projectColor?: string;
    linkTo?: string;
  }[];
  attendanceAlerts: {
    courseId: string;
    courseName: string;
    courseColor: string | null;
    attendancePercent: number;
  }[];
  routines: RoutineWithStreak[];
  tomorrowRoutines: { id: string; name: string; specificTime: string | null }[];
  streakData: {
    activityMap: Record<string, number>;
    currentStreak: number;
  };
  quotes: { id: string; text: string; source: string | null }[];
  activeProjects: {
    id: string;
    name: string;
    color: string | null;
    progress: number;
  }[];
  sgpa: number | null;
  cgpa: number | null;
  latestReview: {
    id: string;
    type: "daily" | "weekly" | "monthly" | "quarterly";
    periodStart: Date;
    periodEnd: Date;
    status: "generated" | "viewed" | "archived";
    summary: string;
  } | null;
  unviewedReviewCount: number;
  reviewStats: {
    totalNotes: number;
    notesDueToday: number;
    notesReviewedThisWeek: number;
    averageReviewCount: number;
  };
};

// ─── Calendar event (merged view) ───────────────────────────
export type CalendarEvent = {
  id: string;
  title: string;
  date: string;
  time?: string;
  endTime?: string;
  type: "class" | "assessment" | "task" | "event" | "birthday";
  courseId?: string;
  courseName?: string;
  courseColor?: string;
  location?: string;
  isBirthday?: boolean;
};

// ─── Grading computation result ─────────────────────────────
export type GradeResult = {
  gradePoint: number;
  sgpa: number | null;
  cgpa: number | null;
  attendanceMarks: number;
  attendancePercent: number;
};

// ─── Knowledge Graph ────────────────────────────────────────
export type GraphNodeType =
  | "semester"
  | "course"
  | "task"
  | "note"
  | "assessment"
  | "routine"
  | "event"
  | "quote"
  | "classSchedule"
  | "attendanceRecord"
  | "domain"
  | "project"
  | "milestone"
  | "budgetEntry"
  | "resource";

export type GraphNode = {
  id: string;
  type: GraphNodeType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>;
};

export type GraphEdge = {
  source: string;
  target: string;
  relation: string;
};

export type GraphResult = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

// ─── Notification preferences ───────────────────────────────
export type DailySummarySection =
  | "classes"
  | "tasks"
  | "routines"
  | "deadlines"
  | "attendance";

// ─── Second Brain: Note with Links ──────────────────────────
export type NoteWithScore = Note & {
  course: Pick<Course, "id" | "name" | "color"> | null;
  score: number;
  linkType: string;
  contextSnippet: string;
};

export type NoteWithLinks = Note & {
  course: Pick<Course, "id" | "name" | "color"> | null;
  outgoingLinks: (NoteLink & {
    target: Note & {
      course: Pick<Course, "id" | "name" | "color"> | null;
    };
  })[];
  incomingLinks: (NoteLink & {
    source: Note & {
      course: Pick<Course, "id" | "name" | "color"> | null;
    };
  })[];
  _count: {
    outgoingLinks: number;
    incomingLinks: number;
  };
};

// ─── Second Brain: Graph Data ───────────────────────────────
export type NoteGraphNode = {
  id: string;
  label: string;
  courseName: string | null;
  courseColor: string | null;
  connectionCount: number;
  lastReviewedAt: Date | null;
};

export type NoteGraphEdge = {
  source: string;
  target: string;
  strength: number;
  linkType: string;
};

export type NoteGraphData = {
  nodes: NoteGraphNode[];
  edges: NoteGraphEdge[];
};

// ─── Document Library ────────────────────────────────────────
export type DocumentFolderWithCount = DocumentFolder & {
  _count: {
    notes: number;
    children: number;
  };
};

export type NoteWithDocumentInfo = Note & {
  course: Pick<Course, "id" | "name" | "color"> | null;
  folder: Pick<DocumentFolder, "id" | "name" | "type" | "color"> | null;
  task: Pick<Task, "id" | "title"> | null;
  project: Pick<Project, "id" | "name" | "color"> | null;
  noteAttachments: NoteAttachment[];
  _count: {
    noteAttachments: number;
    annotations: number;
  };
};

// ─── Attachment Input ────────────────────────────────────────
export interface AttachmentInput {
  type: AttachmentType;
  title: string;
  s3Key: string;
  s3Url: string;
  fileSize: number;
  fileName: string;
  mimeType: string;
  thumbnailUrl?: string;
  pageCount?: number;
}

// ─── Document Note Inputs ───────────────────────────────────
export interface CreateDocumentNoteInput {
  title: string;
  content?: string;
  folderId?: string | null;
  courseId?: string | null;
  semesterId?: string | null;
  taskId?: string | null;
  projectId?: string | null;
  documentType: AttachmentType;
  s3Key: string;
  s3Url: string;
  fileSize: number;
  fileName: string;
  mimeType: string;
  thumbnailUrl?: string;
  pageCount?: number;
  originalUrl?: string;
  embedHtml?: string;
  tags?: string[];
}

export interface UpdateDocumentNoteInput {
  title?: string;
  content?: string;
  folderId?: string | null;
  courseId?: string | null;
  tags?: string[];
  thumbnailUrl?: string;
}

// ─── Document Filters ───────────────────────────────────────
export interface DocumentFilters {
  folderId?: string | null;
  courseId?: string | null;
  taskId?: string | null;
  projectId?: string | null;
  type?: AttachmentType | null;
  searchQuery?: string | null;
  isFavorite?: boolean | null;
  sortBy?: 'createdAt' | 'title' | 'lastViewedAt' | 'fileSize';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}
