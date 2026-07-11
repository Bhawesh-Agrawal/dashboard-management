import { prisma } from "@/lib/prisma";
import { cache } from "react";

export const getTasks = cache(async (filters?: {
  courseId?: string;
  projectId?: string;
  status?: "open" | "done" | "all";
  starred?: boolean;
  dueAfter?: Date;
  dueBefore?: Date;
  userId?: string;
}) => {
  return prisma.task.findMany({
    where: {
      courseId: filters?.courseId,
      projectId: filters?.projectId,
      status: filters?.status === "all" ? undefined : filters?.status,
      starred: filters?.starred,
      dueDate: {
        gte: filters?.dueAfter,
        lte: filters?.dueBefore,
      },
      ...(filters?.userId ? {
        OR: [{ userId: filters.userId }, { userId: null }],
      } : {}),
    },
    orderBy: [
      { sortPriority: { sort: "asc", nulls: "last" } },
      { priority: "asc" },
      { dueDate: "asc" },
    ],
    include: {
      course: { select: { id: true, name: true, color: true } },
      project: { select: { id: true, name: true, color: true } },
    },
  });
});

export const getTaskById = cache(async (id: string, userId?: string) => {
  return prisma.task.findUnique({
    where: {
      id,
      ...(userId ? {
        OR: [{ userId }, { userId: null }],
      } : {}),
    },
    include: {
      course: { select: { id: true, name: true, color: true } },
      project: { select: { id: true, name: true, color: true } },
    },
  });
});

export const getStarredTasks = cache(async (userId?: string) => {
  return prisma.task.findMany({
    where: {
      starred: true,
      status: "open",
      ...(userId ? {
        OR: [{ userId }, { userId: null }],
      } : {}),
    },
    orderBy: [
      { sortPriority: { sort: "asc", nulls: "last" } },
      { priority: "asc" },
      { dueDate: "asc" },
    ],
    take: 3,
    include: {
      course: { select: { id: true, name: true, color: true } },
      project: { select: { id: true, name: true, color: true } },
    },
  });
});

export const getOpenTasks = cache(async (userId?: string) => {
  return prisma.task.findMany({
    where: {
      status: "open",
      ...(userId ? {
        OR: [{ userId }, { userId: null }],
      } : {}),
    },
    orderBy: [
      { sortPriority: { sort: "asc", nulls: "last" } },
      { priority: "asc" },
      { dueDate: "asc" },
    ],
    include: {
      course: { select: { id: true, name: true, color: true } },
      project: { select: { id: true, name: true, color: true } },
    },
  });
});
