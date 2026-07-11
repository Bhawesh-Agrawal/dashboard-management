import { prisma } from "@/lib/prisma";
import { cache } from "react";
import { getCurrentUserId } from "@/lib/auth";

export type SearchResult = {
  id: string;
  type: "note" | "task" | "course" | "quote" | "project" | "budget" | "person" | "resource";
  title: string;
  snippet: string;
  courseId?: string;
  courseName?: string;
  courseColor?: string;
  url: string;
};

/**
 * Global search across Notes, Tasks, Courses, and Quotes.
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

    // Search Quotes
    const quotes = await prisma.quote.findMany({
      where: {
        OR: [
          { text: { contains: searchTerm, mode: "insensitive" } },
          { source: { contains: searchTerm, mode: "insensitive" } },
        ],
      },
      take: 10,
      orderBy: { createdAt: "desc" },
    });

    for (const quote of quotes) {
      results.push({
        id: quote.id,
        type: "quote",
        title: quote.source || "Quote",
        snippet: quote.text.slice(0, 120),
        url: `/library`,
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

    // Search Budget Entries
    const budgetEntries = await prisma.budgetEntry.findMany({
      where: {
        OR: [
          { category: { contains: searchTerm, mode: "insensitive" } },
          { notes: { contains: searchTerm, mode: "insensitive" } },
        ],
      },
      take: 10,
      orderBy: { date: "desc" },
    });

    for (const entry of budgetEntries) {
      results.push({
        id: entry.id,
        type: "budget",
        title: `${entry.category} — ₹${Number(entry.amount).toLocaleString("en-IN")}`,
        snippet: entry.notes || entry.category,
        url: `/budget`,
      });
    }

    // Search People
    const people = await prisma.person.findMany({
      where: {
        OR: [
          { name: { contains: searchTerm, mode: "insensitive" } },
          { notes: { contains: searchTerm, mode: "insensitive" } },
        ],
      },
      take: 10,
      orderBy: { name: "asc" },
    });

    for (const person of people) {
      results.push({
        id: person.id,
        type: "person",
        title: person.name,
        snippet: person.notes || person.name,
        url: `/people/${person.id}`,
      });
    }

    // Search Resources
    const resources = await prisma.resource.findMany({
      where: {
        OR: [
          { title: { contains: searchTerm, mode: "insensitive" } },
          { notes: { contains: searchTerm, mode: "insensitive" } },
        ],
      },
      take: 10,
      orderBy: { createdAt: "desc" },
    });

    for (const resource of resources) {
      results.push({
        id: resource.id,
        type: "resource",
        title: resource.title,
        snippet: resource.notes || resource.title,
        url: `/library`,
      });
    }

    return results;
  }
);
