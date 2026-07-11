"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

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
  energyRequirement?: string;
  estimatedDuration?: number;
  optimalTimeOfDay?: string;
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
      energyRequirement: data.energyRequirement || null,
      estimatedDuration: data.estimatedDuration ?? null,
      optimalTimeOfDay: data.optimalTimeOfDay || null,
    },
  });

  revalidatePath("/tasks");
  revalidatePath("/today");
  if (data.projectId) revalidatePath(`/projects/${data.projectId}`);
  if (data.courseId) revalidatePath(`/courses/${data.courseId}`);
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
    energyRequirement?: string | null;
    estimatedDuration?: number | null;
    optimalTimeOfDay?: string | null;
  }
) {
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
    where: { id },
    data: {
      title: data.title,
      notes: data.notes,
      priority: data.priority,
      status: data.status,
      courseId: data.courseId,
      projectId: data.projectId,
      domainId,
      starred: data.starred,
      energyRequirement: data.energyRequirement,
      estimatedDuration: data.estimatedDuration,
      optimalTimeOfDay: data.optimalTimeOfDay,
      ...completedAtUpdate,
      dueDate: data.dueDate === null ? null : data.dueDate ? new Date(data.dueDate) : undefined,
    },
  });

  revalidatePath("/tasks");
  revalidatePath("/today");
  if (task.courseId) revalidatePath(`/courses/${task.courseId}`);
  if (task.projectId) revalidatePath(`/projects/${task.projectId}`);
  return task;
}

export async function deleteTask(id: string) {
  const task = await prisma.task.delete({
    where: { id },
    select: { courseId: true, projectId: true },
  });

  revalidatePath("/tasks");
  revalidatePath("/today");
  if (task.courseId) revalidatePath(`/courses/${task.courseId}`);
  if (task.projectId) revalidatePath(`/projects/${task.projectId}`);
}

export async function toggleTaskDone(id: string) {
  const task = await prisma.task.findUnique({ where: { id } });
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
}

export async function toggleTaskStarred(id: string) {
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) throw new Error("Task not found");

  await prisma.task.update({ where: { id }, data: { starred: !task.starred } });

  revalidatePath("/tasks");
  revalidatePath("/today");
}
