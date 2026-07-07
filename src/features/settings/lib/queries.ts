import { prisma } from "@/lib/prisma";
import { cache } from "react";

export const getAllCourses = cache(async () => {
  return prisma.course.findMany({
    orderBy: { name: "asc" },
    include: {
      semester: { select: { id: true, name: true } },
      gradingConfigs: { orderBy: { minPercent: "desc" } },
      attendanceMarksConfigs: { orderBy: { minPercent: "desc" } },
    },
  });
});
