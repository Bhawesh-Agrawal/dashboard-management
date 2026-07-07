"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function createProject(data: {
  domainId: string;
  name: string;
  description?: string;
  color?: string;
}) {
  const project = await prisma.project.create({ data });
  revalidatePath("/projects");
  revalidatePath(`/projects/${project.id}`);
  return project;
}

export async function updateProject(
  id: string,
  data: { name?: string; description?: string; color?: string; status?: "active" | "completed" | "archived" }
) {
  const project = await prisma.project.update({ where: { id }, data });
  revalidatePath("/projects");
  revalidatePath(`/projects/${id}`);
  return project;
}

export async function deleteProject(id: string) {
  await prisma.project.delete({ where: { id } });
  revalidatePath("/projects");
}

// ─── Milestones ────────────────────────────────────────────

export async function createMilestone(data: {
  projectId: string;
  name: string;
  weight: number;
}) {
  const milestone = await prisma.milestone.create({ data });
  revalidatePath(`/projects/${data.projectId}`);
  return milestone;
}

export async function updateMilestone(
  id: string,
  data: { name?: string; weight?: number; isDone?: boolean },
  projectId: string
) {
  const milestone = await prisma.milestone.update({ where: { id }, data });
  revalidatePath(`/projects/${projectId}`);
  return milestone;
}

export async function toggleMilestoneDone(id: string, projectId: string) {
  const milestone = await prisma.milestone.findUnique({ where: { id } });
  if (!milestone) throw new Error("Milestone not found");
  await prisma.milestone.update({
    where: { id },
    data: { isDone: !milestone.isDone },
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function deleteMilestone(id: string, projectId: string) {
  await prisma.milestone.delete({ where: { id } });
  revalidatePath(`/projects/${projectId}`);
}
