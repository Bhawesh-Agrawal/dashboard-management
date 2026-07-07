import { prisma } from "@/lib/prisma";
import { DEFAULT_GRADING_CONFIG, DEFAULT_ATTENDANCE_MARKS_CONFIG } from "@/lib/constants";

/**
 * Compute attendance percentage for a course.
 * Formula: present / (present + absent) × 100
 * Cancelled classes are fully excluded from the denominator.
 */
export function computeAttendancePercent(present: number, absent: number): number {
  const total = present + absent;
  if (total === 0) return 0;
  return (present / total) * 100;
}

/**
 * Look up attendance marks (out of 5) from the config table.
 * Uses the course-specific config if available, otherwise falls back to semester defaults,
 * then to the built-in default table.
 */
export function computeAttendanceMarks(
  percent: number,
  config: { minPercent: number; marks: number }[]
): number {
  // Sort descending by minPercent so we find the highest matching tier
  const sorted = [...config].sort((a, b) => b.minPercent - a.minPercent);
  for (const tier of sorted) {
    if (percent >= tier.minPercent) {
      return tier.marks;
    }
  }
  return 0;
}

/**
 * Look up grade point from marks percentage using the grading config.
 * Uses course-specific config if available, otherwise semester defaults, then built-in defaults.
 */
export function computeGradePoint(
  percent: number,
  config: { minPercent: number; gradePoint: number }[]
): number {
  // Sort descending by minPercent
  const sorted = [...config].sort((a, b) => b.minPercent - a.minPercent);
  for (const tier of sorted) {
    if (percent >= tier.minPercent) {
      return tier.gradePoint;
    }
  }
  return 0;
}

/**
 * Compute SGPA for a semester.
 * Formula: Σ(credit × gradePoint) / Σ(credits)
 * Returns null if no courses have grades yet.
 */
export function computeSGPA(
  courses: { credits: number; gradePoint: number | null }[]
): number | null {
  const graded = courses.filter((c) => c.gradePoint !== null);
  if (graded.length === 0) return null;

  const totalWeighted = graded.reduce(
    (sum, c) => sum + c.credits * c.gradePoint!,
    0
  );
  const totalCredits = graded.reduce((sum, c) => sum + c.credits, 0);

  if (totalCredits === 0) return null;
  return Math.round((totalWeighted / totalCredits) * 100) / 100;
}

/**
 * Compute CGPA across all semesters.
 * Formula: Σ(SGPA × semesterCredits) / Σ(semesterCredits)
 * Returns null if no semesters have SGPA computed.
 */
export function computeCGPA(
  semesters: { sgpa: number | null; totalCredits: number }[]
): number | null {
  const withSGPA = semesters.filter((s) => s.sgpa !== null && s.totalCredits > 0);
  if (withSGPA.length === 0) return null;

  const totalWeighted = withSGPA.reduce(
    (sum, s) => sum + s.sgpa! * s.totalCredits,
    0
  );
  const totalCredits = withSGPA.reduce((sum, s) => sum + s.totalCredits, 0);

  if (totalCredits === 0) return null;
  return Math.round((totalWeighted / totalCredits) * 100) / 100;
}

/**
 * Get or create default grading config for a course.
 * First checks for course-specific config, then semester defaults, then creates course defaults.
 */
export async function getGradingConfig(courseId: string, semesterId: string) {
  // Try course-specific config first
  let config = await prisma.gradingConfig.findMany({
    where: { courseId },
    orderBy: { minPercent: "desc" },
  });

  if (config.length > 0) return config;

  // Try semester defaults
  config = await prisma.gradingConfig.findMany({
    where: { semesterId, courseId: null },
    orderBy: { minPercent: "desc" },
  });

  if (config.length > 0) return config;

  // Create course-specific defaults from built-in constants
  const created = await Promise.all(
    DEFAULT_GRADING_CONFIG.map((tier) =>
      prisma.gradingConfig.create({
        data: { courseId, minPercent: tier.minPercent, gradePoint: tier.gradePoint },
      })
    )
  );

  return created;
}

/**
 * Get or create default attendance marks config for a course.
 */
export async function getAttendanceMarksConfig(courseId: string, semesterId: string) {
  let config = await prisma.attendanceMarksConfig.findMany({
    where: { courseId },
    orderBy: { minPercent: "desc" },
  });

  if (config.length > 0) return config;

  config = await prisma.attendanceMarksConfig.findMany({
    where: { semesterId, courseId: null },
    orderBy: { minPercent: "desc" },
  });

  if (config.length > 0) return config;

  const created = await Promise.all(
    DEFAULT_ATTENDANCE_MARKS_CONFIG.map((tier) =>
      prisma.attendanceMarksConfig.create({
        data: { courseId, minPercent: tier.minPercent, marks: tier.marks },
      })
    )
  );

  return created;
}
