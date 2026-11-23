"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUserId, UnauthorizedError } from "@/lib/auth";

/**
 * Mark attendance for a single class session.
 * Creates the record if it doesn't exist, updates if it does.
 */
export async function markAttendance(data: {
  courseId: string;
  date: string;
  status: "present" | "absent" | "cancelled" | "not_marked";
}) {
  const userId = await getCurrentUserId();
  const course = await prisma.course.findFirst({
    where: { id: data.courseId, semester: { OR: [{ userId }, { userId: null }] } },
  });
  if (!course) {
    throw new UnauthorizedError("Course not found or unauthorized");
  }

  const record = await prisma.attendanceRecord.upsert({
    where: {
      courseId_date: {
        courseId: data.courseId,
        date: new Date(data.date),
      },
    },
    update: { status: data.status },
    create: {
      courseId: data.courseId,
      date: new Date(data.date),
      status: data.status,
    },
  });

  revalidatePath(`/courses/${data.courseId}`);
  return record;
}

/**
 * Bulk mark attendance for multiple dates at once.
 */
export async function bulkMarkAttendance(
  courseId: string,
  records: { date: string; status: "present" | "absent" | "cancelled" | "not_marked" }[]
) {
  const userId = await getCurrentUserId();
  const course = await prisma.course.findFirst({
    where: { id: courseId, semester: { OR: [{ userId }, { userId: null }] } },
  });
  if (!course) {
    throw new UnauthorizedError("Course not found or unauthorized");
  }

  await prisma.$transaction(
    records.map((r) =>
      prisma.attendanceRecord.upsert({
        where: {
          courseId_date: {
            courseId,
            date: new Date(r.date),
          },
        },
        update: { status: r.status },
        create: {
          courseId,
          date: new Date(r.date),
          status: r.status,
        },
      })
    )
  );

  revalidatePath(`/courses/${courseId}`);
}

/**
 * Compute attendance summary for a course.
 * Returns present count, absent count, cancelled count, and percentage.
 * Also fetches the attendance-marks config to compute marks out of 5.
 */
export async function getAttendanceSummary(courseId: string) {
  const userId = await getCurrentUserId();
  const course = await prisma.course.findFirst({
    where: { id: courseId, semester: { OR: [{ userId }, { userId: null }] } },
  });
  if (!course) {
    throw new UnauthorizedError("Course not found or unauthorized");
  }

  const records = await prisma.attendanceRecord.findMany({
    where: { courseId },
  });

  const present = records.filter((r) => r.status === "present").length;
  const absent = records.filter((r) => r.status === "absent").length;
  const cancelled = records.filter((r) => r.status === "cancelled").length;
  const notMarked = records.filter((r) => r.status === "not_marked").length;

  const total = present + absent;
  const percent = total === 0 ? 0 : (present / total) * 100;

  return { present, absent, cancelled, notMarked, percent, total: records.length };
}
