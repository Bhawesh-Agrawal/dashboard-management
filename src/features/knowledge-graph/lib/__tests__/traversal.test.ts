import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { traverseGraph, formatGraphContext } from "../traversal";

/**
 * Knowledge Graph traversal tests.
 *
 * These tests create real data in the database, traverse the graph,
 * and verify that connected nodes are returned correctly.
 *
 * Run with: npx vitest run src/features/knowledge-graph/lib/__tests__/traversal.test.ts
 *
 * Requires a running PostgreSQL database. Tests skip if DB is unreachable.
 */

const DB_TIMEOUT = 5000;
let dbAvailable = false;

describe("Knowledge Graph Traversal", () => {
  let semesterId: string;
  let courseId: string;
  let taskId: string;
  let noteId: string;
  let assessmentId: string;

  beforeAll(async () => {
    try {
      await Promise.race([
        prisma.$connect(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("DB timeout")), DB_TIMEOUT)
        ),
      ]);
      dbAvailable = true;
    } catch {
      console.warn("Database not available, skipping integration tests");
      return;
    }

    // Create a semester
    const semester = await prisma.semester.create({
      data: {
        name: "Test Semester",
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-06-30"),
      },
    });
    semesterId = semester.id;

    // Create a course
    const course = await prisma.course.create({
      data: {
        semesterId,
        name: "Test Physics",
        code: "PHY101",
        credits: 3,
        instructor: "Dr. Test",
      },
    });
    courseId = course.id;

    // Create a task linked to the course
    const task = await prisma.task.create({
      data: {
        title: "Physics Assignment 3",
        courseId,
        dueDate: new Date("2026-07-15"),
        priority: 1,
        userId: "default-user",
      },
    });
    taskId = task.id;

    // Create a note linked to the course
    const note = await prisma.note.create({
      data: {
        content: "Thermodynamics chapter 5 is important for exam",
        courseId,
        tags: ["exam-prep", "thermodynamics"],
      },
    });
    noteId = note.id;

    // Create an assessment linked to the course
    const assessment = await prisma.assessment.create({
      data: {
        courseId,
        componentType: "mid_sem",
        maxMarks: 30,
        date: new Date("2026-08-01"),
      },
    });
    assessmentId = assessment.id;
  });

  afterAll(async () => {
    if (!dbAvailable) return;

    // Clean up test data (order matters due to foreign keys)
    await prisma.assessment.deleteMany({ where: { courseId } });
    await prisma.note.deleteMany({ where: { courseId } });
    await prisma.task.deleteMany({ where: { courseId } });
    await prisma.course.deleteMany({ where: { semesterId } });
    await prisma.semester.deleteMany({ where: { id: semesterId } });

    await prisma.$disconnect();
  });

  it("should traverse from course to all connected entities", async () => {
    if (!dbAvailable) {
      console.warn("Skipping: database not available");
      return;
    }

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
    if (!dbAvailable) {
      console.warn("Skipping: database not available");
      return;
    }

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
    if (!dbAvailable) {
      console.warn("Skipping: database not available");
      return;
    }

    const result = await traverseGraph({
      sourceType: "course",
      sourceId: courseId,
      maxHops: 2,
    });

    // Should still have all nodes (no duplicates)
    const uniqueIds = new Set(result.nodes.map((n) => n.id));
    expect(uniqueIds.size).toBe(result.nodes.length);
  });

  it("should respect nodeTypes filter", async () => {
    if (!dbAvailable) {
      console.warn("Skipping: database not available");
      return;
    }

    const result = await traverseGraph({
      sourceType: "course",
      sourceId: courseId,
      maxHops: 1,
      nodeTypes: ["task", "note"],
    });

    // Should only have task and note nodes (not course, semester, assessment)
    const nodeTypes = new Set(result.nodes.map((n) => n.type));
    expect(nodeTypes.has("task")).toBe(true);
    expect(nodeTypes.has("note")).toBe(true);
    expect(nodeTypes.has("course")).toBe(false);
    expect(nodeTypes.has("semester")).toBe(false);
    expect(nodeTypes.has("assessment")).toBe(false);
  });

  it("should format graph context into readable string", async () => {
    if (!dbAvailable) {
      console.warn("Skipping: database not available");
      return;
    }

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
});
