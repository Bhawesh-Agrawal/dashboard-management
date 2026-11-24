import { prisma } from "@/lib/prisma";
import { cache } from "react";
import { getCurrentUserId } from "@/lib/auth";

export type SearchResult = {
  id: string;
  type: "note" | "task" | "course" | "project";
  title: string;
  snippet: string;
  courseId?: string;
  courseName?: string;
  courseColor?: string;
  url: string;
};

/**
 * Global search across Notes, Tasks, Courses, and Projects.
 * Pure DB query — no AI dependency, works even if OpenRouter is down.
 */
export const globalSearch = cache(
  async (query: string): Promise<SearchResult[]> => {
    if (!query.trim()) return [];

    const searchTerm = query.trim();
    const results: SearchResult[] = [];
    const userId = await getCurrentUserId();

    // Search Notes
    const notes = await prisma.note.findMany({
      where: {
        content: { contains: searchTerm, mode: "insensitive" },
      },
      take: 10,
      include: {
        course: { select: { id: true, name: true, color: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    for (const note of notes) {
      results.push({
        id: note.id,
        type: "note",
        title: note.content.slice(0, 50) + (note.content.length > 50 ? "..." : ""),
        snippet: note.content.slice(0, 120),
        courseId: note.courseId ?? undefined,
        courseName: note.course?.name,
        courseColor: note.course?.color ?? undefined,
        url: `/notes/${note.id}`,
      });
    }

    // Search Tasks
    const tasks = await prisma.task.findMany({
      where: {
        AND: [
          { OR: [{ userId }, { userId: null }] },
          {
            OR: [
              { title: { contains: searchTerm, mode: "insensitive" } },
              { notes: { contains: searchTerm, mode: "insensitive" } },
            ],
          },
        ],
      },
      take: 10,
      include: {
        course: { select: { id: true, name: true, color: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    for (const task of tasks) {
      results.push({
        id: task.id,
        type: "task",
        title: task.title,
        snippet: task.notes || task.title,
        courseId: task.courseId ?? undefined,
        courseName: task.course?.name,
        courseColor: task.course?.color ?? undefined,
        url: `/tasks`,
      });
    }

    // Search Courses
    const courses = await prisma.course.findMany({
      where: {
        OR: [
          { name: { contains: searchTerm, mode: "insensitive" } },
          { code: { contains: searchTerm, mode: "insensitive" } },
        ],
      },
      take: 10,
      orderBy: { name: "asc" },
    });

    for (const course of courses) {
      results.push({
        id: course.id,
        type: "course",
        title: course.name + (course.code ? ` (${course.code})` : ""),
        snippet: course.instructor || course.name,
        courseColor: course.color ?? undefined,
        url: `/courses/${course.id}`,
      });
    }

    // Search Projects
    const projects = await prisma.project.findMany({
      where: {
        OR: [
          { name: { contains: searchTerm, mode: "insensitive" } },
          { description: { contains: searchTerm, mode: "insensitive" } },
        ],
      },
      take: 10,
      include: {
        domain: { select: { name: true, color: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    for (const project of projects) {
      results.push({
        id: project.id,
        type: "project",
        title: project.name,
        snippet: project.description || project.name,
        url: `/projects/${project.id}`,
      });
    }

    return results;
  }
);
