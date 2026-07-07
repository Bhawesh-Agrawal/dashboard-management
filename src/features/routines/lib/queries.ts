import { prisma } from "@/lib/prisma";
import { cache } from "react";

export const getRoutines = cache(async () => {
  return prisma.routine.findMany({
    orderBy: [{ timeOfDay: "asc" }, { name: "asc" }],
  });
});
