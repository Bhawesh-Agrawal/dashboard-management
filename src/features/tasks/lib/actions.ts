"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUserId } from "@/lib/auth";
import { memCache } from "@/lib/mem-cache";

/**
 * Lightweight course list for the Link-to picker (called from client components).
 */
export async function getCoursesForPicker() {
  return prisma.course.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      color: true,
      code: true,
      semester: { select: { endDate: true } },
    },
  });
}

/**
 * Lightweight project list for the Link-to picker (called from client components).
 */
export async function getProjectsForPicker() {
  return prisma.project.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      color: true,
      domain: { select: { name: true } },
    },
  });
}

export async function createTask(data: {
  title: string;
  notes?: string;
  dueDate?: string;
  priority?: number;
  courseId?: string;
  projectId?: string;
  starred?: boolean;
  estimatedDuration?: number;
}) {
  // Compute domain_id server-side from courseId/projectId
  let domainId: string | null = null;
  if (data.projectId) {
    const project = await prisma.project.findUnique({
      where: { id: data.projectId },
      select: { domainId: true },
    });
    domainId = project?.domainId ?? null;
  }
  // If courseId is set, domain is implicit "Academics" — no domainId needed

  const userId = await getCurrentUserId();
  const task = await prisma.task.create({
    data: {
      title: data.title,
      notes: data.notes,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      priority: data.priority ?? 2,
      courseId: data.courseId || null,
      projectId: data.projectId || null,
      domainId,
      starred: data.starred ?? false,
      estimatedDuration: data.estimatedDuration ?? null,
      userId,
    },
  });

  revalidatePath("/tasks");
  revalidatePath("/today");
  if (data.projectId) revalidatePath(`/projects/${data.projectId}`);
  if (data.courseId) revalidatePath(`/courses/${data.courseId}`);
  memCache.invalidatePrefix("ai-insights:");
  return task;
}

export async function updateTask(
  id: string,
  data: {
    title?: string;
    notes?: string;
    dueDate?: string | null;
    priority?: number;
    status?: "open" | "done";
    courseId?: string | null;
    projectId?: string | null;
    starred?: boolean;
    estimatedDuration?: number | null;
  }
) {
  const userId = await getCurrentUserId();

  // Compute domain_id server-side from courseId/projectId
  let domainId: string | null = null;
  if (data.projectId) {
    const project = await prisma.project.findUnique({
      where: { id: data.projectId },
      select: { domainId: true },
    });
    domainId = project?.domainId ?? null;
  }

  // When status changes, set or clear completedAt accordingly
  const completedAtUpdate =
    data.status === "done"
      ? { completedAt: new Date() }
      : data.status === "open"
        ? { completedAt: null }
        : {};

  const task = await prisma.task.update({
    where: {
      id,
      OR: [{ userId }, { userId: null }],
    },
    data: {
      title: data.title,
      notes: data.notes,
      priority: data.priority,
      status: data.status,
      courseId: data.courseId,
      projectId: data.projectId,
      domainId,
      starred: data.starred,
      estimatedDuration: data.estimatedDuration,
      ...completedAtUpdate,
      dueDate: data.dueDate === null ? null : data.dueDate ? new Date(data.dueDate) : undefined,
    },
  });

  revalidatePath("/tasks");
  revalidatePath("/today");
  if (task.courseId) revalidatePath(`/courses/${task.courseId}`);
  if (task.projectId) revalidatePath(`/projects/${task.projectId}`);
  memCache.invalidatePrefix("ai-insights:");
  return task;
}

export async function deleteTask(id: string) {
  const userId = await getCurrentUserId();
  const task = await prisma.task.delete({
    where: {
      id,
      OR: [{ userId }, { userId: null }],
    },
    select: { courseId: true, projectId: true },
  });

  revalidatePath("/tasks");
  revalidatePath("/today");
  if (task.courseId) revalidatePath(`/courses/${task.courseId}`);
  if (task.projectId) revalidatePath(`/projects/${task.projectId}`);
  memCache.invalidatePrefix("ai-insights:");
}

export async function toggleTaskDone(id: string) {
  const userId = await getCurrentUserId();
  const task = await prisma.task.findUnique({
    where: {
      id,
      OR: [{ userId }, { userId: null }],
    },
  });
  if (!task) throw new Error("Task not found");

  const newStatus = task.status === "done" ? "open" : "done";
  await prisma.task.update({
    where: { id },
    data: {
      status: newStatus,
      completedAt: newStatus === "done" ? new Date() : null,
    },
  });

  revalidatePath("/tasks");
  revalidatePath("/today");
  if (task.courseId) revalidatePath(`/courses/${task.courseId}`);
  memCache.invalidatePrefix("ai-insights:");
}

export async function toggleTaskStarred(id: string) {
  const userId = await getCurrentUserId();
  const task = await prisma.task.findUnique({
    where: {
      id,
      OR: [{ userId }, { userId: null }],
    },
  });
  if (!task) throw new Error("Task not found");

  await prisma.task.update({ where: { id }, data: { starred: !task.starred } });

  revalidatePath("/tasks");
  revalidatePath("/today");
}
