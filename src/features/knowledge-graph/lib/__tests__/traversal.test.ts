import { describe, it, expect, vi, beforeEach } from "vitest";
import { traverseGraph, formatGraphContext } from "../traversal";
import { prisma } from "@/lib/prisma";

// Mock auth so getCurrentUserId returns a test user ID without Supabase cookies
vi.mock("@/lib/auth", () => ({
  getCurrentUserId: vi.fn(async () => "test-user-123"),
  UnauthorizedError: class UnauthorizedError extends Error {
    constructor(msg = "Unauthorized") {
      super(msg);
      this.name = "UnauthorizedError";
    }
  },
}));

// Mock Prisma client methods used by traversal
vi.mock("@/lib/prisma", () => ({
  prisma: {
    course: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    semester: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    task: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    note: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    assessment: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    classSchedule: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    attendanceRecord: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    project: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    domain: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    milestone: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    routine: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    event: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    quote: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    budgetEntry: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    resource: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

describe("Knowledge Graph Traversal", () => {
  const semesterId = "sem-101";
  const courseId = "course-101";
  const taskId = "task-101";
  const noteId = "note-101";
  const assessmentId = "assess-101";

  const mockSemester = {
    id: semesterId,
    name: "Test Semester",
    startDate: new Date("2026-01-01"),
    endDate: new Date("2026-06-30"),
  };

  const mockCourse = {
    id: courseId,
    semesterId,
    name: "Test Physics",
    code: "PHY101",
    credits: 3,
    instructor: "Dr. Test",
  };

  const mockTask = {
    id: taskId,
    title: "Physics Assignment 3",
    courseId,
    dueDate: new Date("2026-07-15"),
    priority: 1,
    userId: "test-user-123",
  };

  const mockNote = {
    id: noteId,
    content: "Thermodynamics chapter 5 is important for exam",
    courseId,
    tags: ["exam-prep", "thermodynamics"],
  };

  const mockAssessment = {
    id: assessmentId,
    courseId,
    componentType: "mid_sem",
    maxMarks: 30,
    date: new Date("2026-08-01"),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations for entities
    (prisma.course.findUnique as any).mockImplementation(({ where }: any) => {
      if (where.id === courseId) return Promise.resolve(mockCourse);
      return Promise.resolve(null);
    });

    (prisma.semester.findUnique as any).mockImplementation(({ where }: any) => {
      if (where.id === semesterId) return Promise.resolve(mockSemester);
      return Promise.resolve(null);
    });

    (prisma.task.findUnique as any).mockImplementation(({ where }: any) => {
      if (where.id === taskId) return Promise.resolve(mockTask);
      return Promise.resolve(null);
    });

    (prisma.note.findUnique as any).mockImplementation(({ where }: any) => {
      if (where.id === noteId) return Promise.resolve(mockNote);
      return Promise.resolve(null);
    });

    (prisma.assessment.findUnique as any).mockImplementation(({ where }: any) => {
      if (where.id === assessmentId) return Promise.resolve(mockAssessment);
      return Promise.resolve(null);
    });

    // Default mock implementations for course connections
    (prisma.task.findMany as any).mockImplementation(({ where }: any) => {
      if (where?.courseId === courseId) return Promise.resolve([{ id: taskId }]);
      return Promise.resolve([]);
    });

    (prisma.note.findMany as any).mockImplementation(({ where }: any) => {
      if (where?.courseId === courseId) return Promise.resolve([{ id: noteId }]);
      return Promise.resolve([]);
    });

    (prisma.assessment.findMany as any).mockImplementation(({ where }: any) => {
      if (where?.courseId === courseId) return Promise.resolve([{ id: assessmentId }]);
      return Promise.resolve([]);
    });

    (prisma.classSchedule.findMany as any).mockResolvedValue([]);
    (prisma.attendanceRecord.findMany as any).mockResolvedValue([]);
    (prisma.course.findMany as any).mockResolvedValue([]);
  });

  it("should traverse from course to all connected entities", async () => {
    const result = await traverseGraph({
      sourceType: "course",
      sourceId: courseId,
      maxHops: 1,
    });

    // Should have the course itself + task + note + assessment + semester
    const nodeTypes = result.nodes.map((n) => n.type);
    expect(nodeTypes).toContain("course");
    expect(nodeTypes).toContain("task");
    expect(nodeTypes).toContain("note");
    expect(nodeTypes).toContain("assessment");
    expect(nodeTypes).toContain("semester");

    // Should have edges from course to each child
    const edgeRelations = result.edges.map((e) => e.relation);
    expect(edgeRelations).toContain("has_task");
    expect(edgeRelations).toContain("has_note");
    expect(edgeRelations).toContain("has_assessment");
    expect(edgeRelations).toContain("belongs_to");
  });

  it("should include correct node data", async () => {
    const result = await traverseGraph({
      sourceType: "course",
      sourceId: courseId,
      maxHops: 1,
    });

    const courseNode = result.nodes.find(
      (n) => n.type === "course" && n.id === courseId
    );
    expect(courseNode).toBeDefined();
    expect(courseNode!.data.name).toBe("Test Physics");
    expect(courseNode!.data.code).toBe("PHY101");

    const taskNode = result.nodes.find(
      (n) => n.type === "task" && n.id === taskId
    );
    expect(taskNode).toBeDefined();
    expect(taskNode!.data.title).toBe("Physics Assignment 3");

    const noteNode = result.nodes.find(
      (n) => n.type === "note" && n.id === noteId
    );
    expect(noteNode).toBeDefined();
    expect(noteNode!.data.content).toBe(
      "Thermodynamics chapter 5 is important for exam"
    );

    const assessmentNode = result.nodes.find(
      (n) => n.type === "assessment" && n.id === assessmentId
    );
    expect(assessmentNode).toBeDefined();
    expect(assessmentNode!.data.componentType).toBe("mid_sem");
    expect(assessmentNode!.data.maxMarks).toBe(30);
  });

  it("should traverse 2 hops without duplicates", async () => {
    const result = await traverseGraph({
      sourceType: "course",
      sourceId: courseId,
      maxHops: 2,
    });

    const uniqueIds = new Set(result.nodes.map((n) => n.id));
    expect(uniqueIds.size).toBe(result.nodes.length);
  });

  it("should respect nodeTypes filter", async () => {
    const result = await traverseGraph({
      sourceType: "course",
      sourceId: courseId,
      maxHops: 1,
      nodeTypes: ["task", "note"],
    });

    const nodeTypes = new Set(result.nodes.map((n) => n.type));
    expect(nodeTypes.has("task")).toBe(true);
    expect(nodeTypes.has("note")).toBe(true);
    expect(nodeTypes.has("course")).toBe(false);
    expect(nodeTypes.has("semester")).toBe(false);
    expect(nodeTypes.has("assessment")).toBe(false);
  });

  it("should format graph context into readable string", async () => {
    const result = await traverseGraph({
      sourceType: "course",
      sourceId: courseId,
      maxHops: 1,
    });

    const context = formatGraphContext(result);

    expect(context).toContain("## Courses");
    expect(context).toContain("Test Physics");
    expect(context).toContain("## Tasks");
    expect(context).toContain("Physics Assignment 3");
    expect(context).toContain("## Notes");
    expect(context).toContain("Thermodynamics chapter 5");
    expect(context).toContain("## Relationships");
    expect(context).toContain("has_task");
    expect(context).toContain("belongs_to");
  });

  it("should operate without people nodes", async () => {
    const result = await traverseGraph({
      sourceType: "course",
      sourceId: courseId,
      maxHops: 2,
    });
    const hasPerson = result.nodes.some((n) => (n.type as string) === "person");
    expect(hasPerson).toBe(false);
  });
});
