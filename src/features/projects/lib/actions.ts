"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { ownerWhere } from "@/lib/owner-scoping";
import { revalidatePath } from "next/cache";

export async function createProject(data: {
  domainId: string;
  name: string;
  description?: string;
  color?: string;
}) {
  const userId = await getCurrentUserId();
  const domain = await prisma.domain.findFirst({
    where: { id: data.domainId, ...ownerWhere(userId) },
    select: { id: true },
  });
  if (!domain) throw new Error("Domain not found");

  const project = await prisma.project.create({ data });
  revalidatePath("/projects");
  revalidatePath(`/projects/${project.id}`);
  return project;
}

export async function updateProject(
  id: string,
  data: { name?: string; description?: string; color?: string; status?: "active" | "completed" | "archived" }
) {
  const userId = await getCurrentUserId();
  const existing = await prisma.project.findFirst({
    where: { id, domain: ownerWhere(userId) },
    select: { id: true },
  });
  if (!existing) throw new Error("Project not found");

  const project = await prisma.project.update({ where: { id }, data });
  revalidatePath("/projects");
  revalidatePath(`/projects/${id}`);
  return project;
}

export async function deleteProject(id: string) {
  const userId = await getCurrentUserId();
  const existing = await prisma.project.findFirst({
    where: { id, domain: ownerWhere(userId) },
    select: { id: true },
  });
  if (!existing) throw new Error("Project not found");

  await prisma.project.delete({ where: { id } });
  revalidatePath("/projects");
}

// ─── Milestones ────────────────────────────────────────────

export async function createMilestone(data: {
  projectId: string;
  name: string;
  weight: number;
}) {
  const userId = await getCurrentUserId();
  const project = await prisma.project.findFirst({
    where: { id: data.projectId, domain: ownerWhere(userId) },
    select: { id: true },
  });
  if (!project) throw new Error("Project not found");

  const milestone = await prisma.milestone.create({ data });
  revalidatePath(`/projects/${data.projectId}`);
  return milestone;
}

export async function updateMilestone(
  id: string,
  data: { name?: string; weight?: number; isDone?: boolean },
  projectId: string
) {
  const userId = await getCurrentUserId();
  const existing = await prisma.milestone.findFirst({
    where: { id, project: { domain: ownerWhere(userId) } },
    select: { id: true },
  });
  if (!existing) throw new Error("Milestone not found");

  const milestone = await prisma.milestone.update({ where: { id }, data });
  revalidatePath(`/projects/${projectId}`);
  return milestone;
}

export async function toggleMilestoneDone(id: string, projectId: string) {
  const userId = await getCurrentUserId();
  const milestone = await prisma.milestone.findFirst({
    where: { id, project: { domain: ownerWhere(userId) } },
  });
  if (!milestone) throw new Error("Milestone not found");
  await prisma.milestone.update({
    where: { id },
    data: { isDone: !milestone.isDone },
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function deleteMilestone(id: string, projectId: string) {
  const userId = await getCurrentUserId();
  const existing = await prisma.milestone.findFirst({
    where: { id, project: { domain: ownerWhere(userId) } },
    select: { id: true },
  });
  if (!existing) throw new Error("Milestone not found");

  await prisma.milestone.delete({ where: { id } });
  revalidatePath(`/projects/${projectId}`);
}
