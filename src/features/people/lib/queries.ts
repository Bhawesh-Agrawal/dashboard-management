import { prisma } from "@/lib/prisma";
import { cache } from "react";

/**
 * Get all people, ordered by name.
 */
export const getPeople = cache(async () => {
  return prisma.person.findMany({
    orderBy: { name: "asc" },
  });
});

/**
 * Get a single person by ID.
 */
export const getPersonById = cache(async (id: string) => {
  return prisma.person.findUnique({
    where: { id },
  });
});
