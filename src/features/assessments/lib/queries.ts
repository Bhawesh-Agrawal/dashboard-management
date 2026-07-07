import { prisma } from "@/lib/prisma";
import {
  computeAttendancePercent,
  computeAttendanceMarks,
  getGradingConfig,
  getAttendanceMarksConfig,
} from "./calculations";

/**
 * Compute grade point for a single course, including auto-computed
 * attendance marks. Used by dashboard, course detail, and semester pages.
 *
 * The attendance component is system-managed: the Assessment row has obtainedMarks=null,
 * so we compute from AttendanceRecords live and inject the result into the total.
 *
 * If the attendance assessment row is missing (e.g. pre-Phase-1 courses),
 * it is created on the fly so the 5 attendance marks are always counted.
 *
 * Supports two attendance modes:
 * - auto: compute from AttendanceRecord rows (default)
 * - manual: use course.manualPresent / course.manualTotalClasses
 */
export async function computeCourseGrade(course: {
  id: string;
  credits: number;
  semesterId: string;
  attendanceMode?: "auto" | "manual" | null;
  manualPresent?: number | null;
  manualTotalClasses?: number | null;
}): Promise<{ credits: number; gradePoint: number | null }> {
  const [assessments, gradingConfigs, attendanceRecords, attConfigs] =
    await Promise.all([
      prisma.assessment.findMany({ where: { courseId: course.id } }),
      getGradingConfig(course.id, course.semesterId),
      prisma.attendanceRecord.findMany({ where: { courseId: course.id } }),
      getAttendanceMarksConfig(course.id, course.semesterId),
    ]);

  // Backfill: if no attendance assessment row exists, create one.
  // This covers courses created before the attendance-row fix shipped.
  // Uses upsert-like logic: check existing first to avoid duplicates.
  const hasAttendanceRow = assessments.some((a) => a.componentType === "attendance");
  if (!hasAttendanceRow) {
    // Double-check with a direct query to avoid race condition duplicates
    const existing = await prisma.assessment.findFirst({
      where: { courseId: course.id, componentType: "attendance" },
    });
    if (!existing) {
      await prisma.assessment.create({
        data: {
          courseId: course.id,
          componentType: "attendance",
          maxMarks: 5,
          obtainedMarks: null,
        },
      });
    }
  }

  // Sum manual assessments (skip attendance — it's auto-computed)
  let obtained = 0;
  let max = 0;
  for (const a of assessments) {
    if (a.componentType === "attendance") continue;
    if (a.obtainedMarks !== null) obtained += a.obtainedMarks;
    max += a.maxMarks;
  }

  // Compute attendance marks based on mode
  let attPercent: number;
  if (
    course.attendanceMode === "manual" &&
    course.manualPresent != null &&
    course.manualTotalClasses != null &&
    course.manualTotalClasses > 0
  ) {
    // Manual mode: use user-provided present/total classes
    const absent = course.manualTotalClasses - course.manualPresent;
    attPercent = computeAttendancePercent(course.manualPresent, absent);
  } else {
    // Auto mode: compute from AttendanceRecord rows
    const present = attendanceRecords.filter((r) => r.status === "present").length;
    const absent = attendanceRecords.filter((r) => r.status === "absent").length;
    attPercent = computeAttendancePercent(present, absent);
  }

  const attMarks = computeAttendanceMarks(
    attPercent,
    attConfigs.map((c) => ({ minPercent: c.minPercent, marks: c.marks }))
  );

  // Always include attendance marks (row is guaranteed to exist now)
  obtained += attMarks;
  max += 5;

  const pct = max === 0 ? 0 : (obtained / max) * 100;
  const sorted = [...gradingConfigs].sort((a, b) => b.minPercent - a.minPercent);
  let gp = 0;
  for (const tier of sorted) {
    if (pct >= tier.minPercent) {
      gp = tier.gradePoint;
      break;
    }
  }

  // Use ?? instead of || so gradePoint=0 (fail) is preserved, not turned into null
  return { credits: course.credits, gradePoint: gp ?? null };
}
