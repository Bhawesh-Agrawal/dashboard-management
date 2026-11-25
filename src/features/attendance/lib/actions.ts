"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUserId, UnauthorizedError } from "@/lib/auth";
import { ownerWhere } from "@/lib/owner-scoping";
import { parseDateOnly, formatDateOnly, getTodayInTimezone, getDayOfWeekInTimezone } from "@/lib/timezone";
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

  // Run course ownership verification and user timezone lookup in parallel
  const [course, timezone] = await Promise.all([
    prisma.course.findFirst({
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
    }),
    getUserTimezone(userId),
  ]);

  if (!course) {
    throw new UnauthorizedError("Course not found or unauthorized");
  }

  const dateStr = validated.date ? formatDateOnly(validated.date) : getTodayInTimezone(timezone, getNow());
  const dateObj = parseDateOnly(dateStr);

  const dbStatus: AttendanceStatus = validated.status === "unmarked" ? "not_marked" : validated.status;

  let scheduleId = validated.classScheduleId;

  if (!scheduleId) {
    const dow = getDayOfWeekInTimezone(timezone, dateObj);
    const matchingSchedules = await prisma.classSchedule.findMany({
      where: {
        courseId: validated.courseId,
        dayOfWeek: dow,
        OR: [
          { effectiveStartDate: null },
          { effectiveStartDate: { lte: dateObj } },
        ],
        AND: [
          {
            OR: [
              { effectiveEndDate: null },
              { effectiveEndDate: { gte: dateObj } },
            ],
          },
        ],
      },
    });

    if (matchingSchedules.length === 1) {
      scheduleId = matchingSchedules[0].id;
    }
  }

  let record;

  if (scheduleId) {
    // Idempotent upsert on (classScheduleId, date)
    record = await prisma.attendanceRecord.upsert({
      where: {
        classScheduleId_date: {
          classScheduleId: scheduleId,
          date: dateObj,
        },
      },
      update: {
        status: dbStatus,
        courseId: validated.courseId,
      },
      create: {
        courseId: validated.courseId,
        classScheduleId: scheduleId,
        date: dateObj,
        status: dbStatus,
      },
    });
  } else {
    // Ambiguous match or no schedule: match record with classScheduleId: null
    const existing = await prisma.attendanceRecord.findFirst({
      where: {
        courseId: validated.courseId,
        date: dateObj,
        classScheduleId: null,
      },
    });

    if (existing) {
      record = await prisma.attendanceRecord.update({
        where: { id: existing.id },
        data: { status: dbStatus },
      });
    } else {
      record = await prisma.attendanceRecord.create({
        data: {
          courseId: validated.courseId,
          date: dateObj,
          status: dbStatus,
        },
      });
    }
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
  const [course, timezone] = await Promise.all([
    prisma.course.findFirst({
      where: { id: courseId, semester: ownerWhere(userId) },
      select: {
        id: true,
        attendanceMode: true,
        manualPresent: true,
        manualTotalClasses: true,
      },
    }),
    getUserTimezone(userId),
  ]);

  if (!course) {
    throw new UnauthorizedError("Course not found or unauthorized");
  }

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
      const existing = await prisma.attendanceRecord.findFirst({
        where: {
          courseId,
          date: dateObj,
          classScheduleId: null,
        },
      });

      if (existing) {
        await prisma.attendanceRecord.update({
          where: { id: existing.id },
          data: { status: dbStatus },
        });
      } else {
        await prisma.attendanceRecord.create({
          data: {
            courseId,
            date: dateObj,
            status: dbStatus,
          },
        });
      }
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
