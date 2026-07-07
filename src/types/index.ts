import type {
  Semester,
  Course,
  ClassSchedule,
  AttendanceRecord,
  Assessment,
  Task,
  Note,
  GradingConfig,
  AttendanceMarksConfig,
  Project,
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
};

// ─── Dashboard data ─────────────────────────────────────────
export type DashboardData = {
  topTasks: TaskWithCourse[];
  allOpenTasks: TaskWithCourse[];
  todayClasses: (ClassSchedule & { course: Pick<Course, "id" | "name" | "color" | "code"> })[];
  upcomingDeadlines: {
    id: string;
    title: string;
    date: Date;
    type: "assessment" | "task" | "event" | "birthday";
    courseName?: string;
    courseColor?: string;
    projectName?: string;
    projectColor?: string;
    personId?: string;
    personName?: string;
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
};

// ─── Calendar event (merged view) ───────────────────────────
export type CalendarEvent = {
  id: string;
  title: string;
  date: string;
  time?: string;
  endTime?: string;
  type: "class" | "assessment" | "task" | "event";
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
  | "resource"
  | "person";

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
