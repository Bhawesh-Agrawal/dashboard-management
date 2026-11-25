import { DayOfWeek } from "@prisma/client";
import { enforceProductionGuard } from "./guard";

const DOW_MAP: Record<number, DayOfWeek> = {
  0: "SUN",
  1: "MON",
  2: "TUE",
  3: "WED",
  4: "THU",
  5: "FRI",
  6: "SAT",
};

export interface BackfillPlan {
  totalRecords: number;
  alreadyLinked: number;
  mappedCount: number;
  unmappedCount: number;
  needsReviewCount: number;
  plannedUpdates: Array<{
    recordId: string;
    courseId: string;
    courseName: string;
    date: string;
    dayOfWeek: DayOfWeek;
    classScheduleId: string;
    timeSlot: string;
  }>;
  unmappedRecords: Array<{
    recordId: string;
    courseId: string;
    courseName: string;
    date: string;
    dayOfWeek: DayOfWeek;
    reason: string;
    status: "unmapped" | "needs review";
  }>;
}

export function planAttendanceBackfill(
  records: Array<{
    id: string;
    courseId: string;
    classScheduleId: string | null;
    date: Date;
    course: {
      name: string;
      classSchedules: Array<{
        id: string;
        dayOfWeek: DayOfWeek;
        startTime: string;
        endTime: string;
        effectiveStartDate: Date | null;
        effectiveEndDate: Date | null;
      }>;
    };
  }>
): BackfillPlan {
  const plan: BackfillPlan = {
    totalRecords: records.length,
    alreadyLinked: 0,
    mappedCount: 0,
    unmappedCount: 0,
    needsReviewCount: 0,
    plannedUpdates: [],
    unmappedRecords: [],
  };

  for (const record of records) {
    if (record.classScheduleId) {
      plan.alreadyLinked++;
      continue;
    }

    const dateStr = record.date.toISOString().slice(0, 10);
    const dayOfWeek = DOW_MAP[record.date.getUTCDay()];

    // Filter class schedules matching day of week and effective date range
    const matchingSchedules = record.course.classSchedules.filter((sched) => {
      if (sched.dayOfWeek !== dayOfWeek) return false;
      if (sched.effectiveStartDate && sched.effectiveStartDate > record.date) return false;
      if (sched.effectiveEndDate && sched.effectiveEndDate < record.date) return false;
      return true;
    });

    if (matchingSchedules.length === 1) {
      const match = matchingSchedules[0];
      plan.mappedCount++;
      plan.plannedUpdates.push({
        recordId: record.id,
        courseId: record.courseId,
        courseName: record.course.name,
        date: dateStr,
        dayOfWeek,
        classScheduleId: match.id,
        timeSlot: `${match.startTime}-${match.endTime}`,
      });
    } else if (matchingSchedules.length === 0) {
      plan.unmappedCount++;
      plan.unmappedRecords.push({
        recordId: record.id,
        courseId: record.courseId,
        courseName: record.course.name,
        date: dateStr,
        dayOfWeek,
        reason: `No class schedule found for course on ${dayOfWeek}`,
        status: "unmapped",
      });
    } else {
      // Ambiguous: 2 or more schedules on the same weekday.
      // Must NEVER guess. Kept unmatched (classScheduleId: null) and marked as "needs review".
      plan.unmappedCount++;
      plan.needsReviewCount++;
      plan.unmappedRecords.push({
        recordId: record.id,
        courseId: record.courseId,
        courseName: record.course.name,
        date: dateStr,
        dayOfWeek,
        reason: `Ambiguous match: ${matchingSchedules.length} schedules found on ${dayOfWeek} (${matchingSchedules.map((s) => `${s.startTime}-${s.endTime}`).join(", ")}) — kept unmatched (classScheduleId: NULL, needs review)`,
        status: "needs review",
      });
    }
  }

  return plan;
}

async function main() {
  enforceProductionGuard("scripts/backfill-attendance-occurrence.ts");
  const { prisma } = await import("../src/lib/prisma");

  const args = process.argv.slice(2);
  const execute = args.includes("--execute");

  console.log(`\nAttendance Occurrence Backfill`);
  console.log(`Mode: ${execute ? "EXECUTE (live database writes)" : "DRY RUN (read-only preview)"}\n`);

  const records = await prisma.attendanceRecord.findMany({
    include: {
      course: {
        include: {
          classSchedules: true,
        },
      },
    },
    orderBy: { date: "asc" },
  });

  const plan = planAttendanceBackfill(records);

  console.log(`Scan Summary:`);
  console.log(` - Total attendance records: ${plan.totalRecords}`);
  console.log(` - Already linked to schedule: ${plan.alreadyLinked}`);
  console.log(` - Successfully mapped to a schedule: ${plan.mappedCount}`);
  console.log(` - Unmapped records (preserved untouched): ${plan.unmappedCount}`);
  console.log(`   └─ Needs Review (ambiguous multi-schedule matches, never guessed): ${plan.needsReviewCount}\n`);

  if (plan.unmappedRecords.length > 0) {
    console.log(`⚠️ Unmapped / Needs Review Records (${plan.unmappedRecords.length}):`);
    for (const unmapped of plan.unmappedRecords) {
      const badge = unmapped.status === "needs review" ? "[NEEDS REVIEW]" : "[UNMAPPED]";
      console.log(`   - ${badge} [${unmapped.recordId}] ${unmapped.courseName} on ${unmapped.date} (${unmapped.dayOfWeek}): ${unmapped.reason}`);
    }
    console.log("");
  }

  if (plan.plannedUpdates.length === 0) {
    console.log("No records require backfilling. Done.");
    return;
  }

  if (!execute) {
    console.log(`[DRY RUN] Would update ${plan.plannedUpdates.length} record(s) with classScheduleId.`);
    console.log("Sample updates:");
    for (const update of plan.plannedUpdates.slice(0, 5)) {
      console.log(`   - Record ${update.recordId} (${update.courseName}, ${update.date}): schedule ${update.classScheduleId} [${update.timeSlot}]`);
    }
    if (plan.plannedUpdates.length > 5) {
      console.log(`   ... and ${plan.plannedUpdates.length - 5} more.`);
    }
    console.log("\nTo apply these updates, run with --execute:");
    console.log("  DEPLOY_ENV=local npx tsx scripts/backfill-attendance-occurrence.ts --execute\n");
  } else {
    console.log(`Applying ${plan.plannedUpdates.length} updates...`);
    let updated = 0;
    for (const update of plan.plannedUpdates) {
      await prisma.attendanceRecord.update({
        where: { id: update.recordId },
        data: { classScheduleId: update.classScheduleId },
      });
      updated++;
    }
    console.log(`[EXECUTE SUCCESS] Successfully backfilled ${updated} attendance record(s).\n`);
  }
}

const isMain = typeof process !== "undefined" && process.argv[1] && process.argv[1].endsWith("backfill-attendance-occurrence.ts");

if (isMain) {
  main().catch((err) => {
    console.error("Error during attendance backfill:", err);
    process.exit(1);
  });
}
