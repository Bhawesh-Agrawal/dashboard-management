import { prisma } from "@/lib/prisma";
import { cache } from "react";

const DEFAULT_DOMAINS = [
  { name: "Academics", color: "#3b82f6" },
  { name: "Personal", color: "#22c55e" },
  { name: "Client", color: "#f59e0b" },
];

/**
 * Get all domains, ordered by name.
 * Auto-seeds the three default domains if the table is empty.
 */
export const getDomains = cache(async () => {
  const count = await prisma.domain.count();
  if (count === 0) {
    await prisma.domain.createMany({ data: DEFAULT_DOMAINS });
  }

  return prisma.domain.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { projects: true } },
    },
  });
});

/**
 * Get a single domain by ID with its projects.
 */
export const getDomainById = cache(async (id: string) => {
  return prisma.domain.findUnique({
    where: { id },
    include: {
      projects: {
        orderBy: { createdAt: "desc" },
        include: {
          _count: { select: { milestones: true, tasks: true } },
        },
      },
    },
  });
});
