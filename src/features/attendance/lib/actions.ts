"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUserId, UnauthorizedError } from "@/lib/auth";
import { ownerWhere } from "@/lib/owner-scoping";
import { parseDateOnly, formatDateOnly, getTodayInTimezone } from "@/lib/timezone";
import { getUserTimezone } from "@/lib/timezone-server";
import { getNow } from "@/lib/clock";
import {
  computeAttendanceMetrics,
  resolveAttendanceCounts,
  AttendanceMetrics,
} from "./calculations";
import { AttendanceStatus } from "@prisma/client";

const MarkAttendanceSchema = z.object({
  courseId: z.string().min(1, "Course ID is required"),
  classScheduleId: z.string().nullish(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD").optional(),
  status: z.enum(["present", "absent", "cancelled", "unmarked", "not_marked"]),
});

export type MarkAttendanceInput = z.infer<typeof MarkAttendanceSchema>;

export interface MarkAttendanceResult {
  success: boolean;
  record: {
    id: string;
    courseId: string;
    classScheduleId: string | null;
    date: string;
    status: AttendanceStatus;
  };
  summary: AttendanceMetrics;
}

/**
 * Single unified attendance marking server action.
 * Authenticated, ownership-checked, idempotent, input-validated.
 * Returns the updated attendance summary for the course.
 */
export async function markAttendance(input: MarkAttendanceInput): Promise<MarkAttendanceResult> {
  const validated = MarkAttendanceSchema.parse(input);
  const userId = await getCurrentUserId();

  // Verify ownership of the course through semester
  const course = await prisma.course.findFirst({
    where: {
      id: validated.courseId,
      semester: ownerWhere(userId),
    },
    select: {
      id: true,
      attendanceMode: true,
      manualPresent: true,
      manualTotalClasses: true,
    },
  });

  if (!course) {
    throw new UnauthorizedError("Course not found or unauthorized");
  }

  // Resolve user timezone and date
  const timezone = await getUserTimezone(userId);
  const dateStr = validated.date ? formatDateOnly(validated.date) : getTodayInTimezone(timezone, getNow());
  const dateObj = parseDateOnly(dateStr);

  const dbStatus: AttendanceStatus = validated.status === "unmarked" ? "not_marked" : validated.status;

  let record;

  if (validated.classScheduleId) {
    // Idempotent upsert on (classScheduleId, date)
    record = await prisma.attendanceRecord.upsert({
      where: {
        classScheduleId_date: {
          classScheduleId: validated.classScheduleId,
          date: dateObj,
        },
      },
      update: {
        status: dbStatus,
        courseId: validated.courseId,
      },
      create: {
        courseId: validated.courseId,
        classScheduleId: validated.classScheduleId,
        date: dateObj,
        status: dbStatus,
      },
    });
  } else {
    // Idempotent fallback upsert on (courseId, date)
    record = await prisma.attendanceRecord.upsert({
      where: {
        courseId_date: {
          courseId: validated.courseId,
          date: dateObj,
        },
      },
      update: {
        status: dbStatus,
      },
      create: {
        courseId: validated.courseId,
        date: dateObj,
        status: dbStatus,
      },
    });
  }

  // Fetch updated attendance records for the course to produce new metrics
  const allRecords = await prisma.attendanceRecord.findMany({
    where: { courseId: validated.courseId },
    select: { status: true },
  });

  const counts = resolveAttendanceCounts({
    attendanceMode: course.attendanceMode,
    manualPresent: course.manualPresent,
    manualTotalClasses: course.manualTotalClasses,
    attendanceRecords: allRecords,
  });

  const summary = computeAttendanceMetrics({
    present: counts.present,
    absent: counts.absent,
    cancelled: counts.cancelled,
    unmarked: counts.unmarked,
  });

  revalidatePath(`/courses/${validated.courseId}`);
  revalidatePath("/today");

  return {
    success: true,
    record: {
      id: record.id,
      courseId: record.courseId,
      classScheduleId: record.classScheduleId,
      date: dateStr,
      status: record.status,
    },
    summary,
  };
}

/**
 * Bulk mark attendance for multiple occurrences.
 * Authenticated and ownership-checked.
 */
export async function bulkMarkAttendance(
  courseId: string,
  occurrences: Array<{
    classScheduleId?: string | null;
    date?: string;
    status: "present" | "absent" | "cancelled" | "unmarked" | "not_marked";
  }>
): Promise<{ success: boolean; updatedCount: number; summary: AttendanceMetrics }> {
  const userId = await getCurrentUserId();
  const course = await prisma.course.findFirst({
    where: { id: courseId, semester: ownerWhere(userId) },
    select: {
      id: true,
      attendanceMode: true,
      manualPresent: true,
      manualTotalClasses: true,
    },
  });

  if (!course) {
    throw new UnauthorizedError("Course not found or unauthorized");
  }

  const timezone = await getUserTimezone(userId);

  for (const occ of occurrences) {
    const dateStr = occ.date ? formatDateOnly(occ.date) : getTodayInTimezone(timezone, getNow());
    const dateObj = parseDateOnly(dateStr);
    const dbStatus: AttendanceStatus = occ.status === "unmarked" ? "not_marked" : occ.status;

    if (occ.classScheduleId) {
      await prisma.attendanceRecord.upsert({
        where: {
          classScheduleId_date: {
            classScheduleId: occ.classScheduleId,
            date: dateObj,
          },
        },
        update: { status: dbStatus, courseId },
        create: {
          courseId,
          classScheduleId: occ.classScheduleId,
          date: dateObj,
          status: dbStatus,
        },
      });
    } else {
      await prisma.attendanceRecord.upsert({
        where: {
          courseId_date: {
            courseId,
            date: dateObj,
          },
        },
        update: { status: dbStatus },
        create: {
          courseId,
          date: dateObj,
          status: dbStatus,
        },
      });
    }
  }

  const allRecords = await prisma.attendanceRecord.findMany({
    where: { courseId },
    select: { status: true },
  });

  const counts = resolveAttendanceCounts({
    attendanceMode: course.attendanceMode,
    manualPresent: course.manualPresent,
    manualTotalClasses: course.manualTotalClasses,
    attendanceRecords: allRecords,
  });

  const summary = computeAttendanceMetrics({
    present: counts.present,
    absent: counts.absent,
    cancelled: counts.cancelled,
    unmarked: counts.unmarked,
  });

  revalidatePath(`/courses/${courseId}`);
  revalidatePath("/today");

  return {
    success: true,
    updatedCount: occurrences.length,
    summary,
  };
}

/**
 * Computes the full attendance summary for a course.
 */
export async function getAttendanceSummary(courseId: string): Promise<AttendanceMetrics> {
  const userId = await getCurrentUserId();
  const course = await prisma.course.findFirst({
    where: { id: courseId, semester: ownerWhere(userId) },
    select: {
      id: true,
      attendanceMode: true,
      manualPresent: true,
      manualTotalClasses: true,
      attendanceRecords: { select: { status: true } },
    },
  });

  if (!course) {
    throw new UnauthorizedError("Course not found or unauthorized");
  }

  const counts = resolveAttendanceCounts(course);
  return computeAttendanceMetrics({
    present: counts.present,
    absent: counts.absent,
    cancelled: counts.cancelled,
    unmarked: counts.unmarked,
  });
}
