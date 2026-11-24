import type { ReviewType, ReviewStatus } from "@prisma/client";

export type { ReviewType, ReviewStatus };

export interface ReviewSection {
  title: string;
  content: string;
  order: number;
}

export interface ActionItem {
  text: string;
  type: "kill" | "automate" | "focus" | "unblock" | "experiment" | "general";
  priority: "high" | "medium" | "low";
}

export interface ReviewMetrics {
  tasksCompleted: number;
  tasksTotal: number;
  completionRate: number;
  routineAdherence: number;
  moodAverage?: number;
  sleepAverage?: number;
  totalSpent?: number;
  attendanceRate?: number;
  deepWorkHours?: number;
  notesCreated?: number;
  projectsProgress?: { name: string; progress: number }[];
  identityStrength?: { name: string; score: number }[];
  weeklyTrends?: {
    label: string;
    values: number[];
  }[];
}

export interface ParsedReview {
  summary: string;
  sections: ReviewSection[];
  actions: ActionItem[];
  metrics: ReviewMetrics;
}

export interface ReviewDataSummary {
  tasks: {
    title: string;
    status: string;
    priority: number;
    dueDate: Date | null;
    completedAt: Date | null;
    courseName: string | null;
    projectName: string | null;
  }[];
  routines: {
    name: string;
    activeDays: string[];
    category: string | null;
    completions: Date[];
    identityName: string | null;
  }[];
  lifeMetrics: {
    category: string;
    value: number;
    recordedAt: Date;
  }[];
  attendance: {
    courseName: string;
    courseCode: string | null;
    status: string;
    date: Date;
  }[];
  budget: {
    amount: number;
    category: string;
    type: string;
    date: Date;
  }[];
  notes: {
    tags: string[];
    courseId: string | null;
    createdAt: Date;
  }[];
  assessments: {
    componentType: string;
    maxMarks: number;
    obtainedMarks: number | null;
    date: Date | null;
    courseName: string;
    courseCode: string | null;
  }[];
  projects: {
    name: string;
    status: string;
    updatedAt: Date;
    milestones: { name: string; isDone: boolean }[];
  }[];
  people: {
    name: string;
    lastContact: Date | null;
    contactFrequency: string | null;
    relationshipType: string | null;
  }[];
  identities: {
    statement: string;
    status: string;
    routines: string[];
  }[];
  ignoredInsights: {
    title: string;
    description: string;
    severity: string;
    type: string;
  }[];
  classes: {
    courseName: string;
    courseCode: string | null;
    startTime: string;
    endTime: string;
    location: string | null;
  }[];
  periodStart: Date;
  periodEnd: Date;
}
