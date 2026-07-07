import { prisma } from "@/lib/prisma";
import { cache } from "react";

/**
 * Get all projects grouped by domain, with milestone/task counts.
 */
export const getProjectsByDomain = cache(async (domainId: string) => {
  return prisma.project.findMany({
    where: { domainId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { milestones: true, tasks: true } },
      milestones: { select: { isDone: true, weight: true } },
    },
  });
});

/**
 * Get all projects across all domains (for the projects list page).
 */
export const getAllProjects = cache(async () => {
  return prisma.project.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      domain: { select: { id: true, name: true, color: true } },
      _count: { select: { milestones: true, tasks: true } },
      milestones: { select: { isDone: true, weight: true } },
    },
  });
});

/**
 * Get a single project by ID with full detail.
 */
export const getProjectById = cache(async (id: string) => {
  return prisma.project.findUnique({
    where: { id },
    include: {
      domain: true,
      milestones: { orderBy: { createdAt: "asc" } },
      tasks: {
        orderBy: [{ priority: "asc" }, { dueDate: "asc" }],
        include: {
          course: { select: { id: true, name: true, color: true } },
          project: { select: { id: true, name: true, color: true } },
        },
      },
    },
  });
});

/**
 * Lightweight project list for the Link-to picker.
 */
export const getAllProjectsForPicker = cache(async () => {
  return prisma.project.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      color: true,
      domain: { select: { name: true } },
    },
  });
});
