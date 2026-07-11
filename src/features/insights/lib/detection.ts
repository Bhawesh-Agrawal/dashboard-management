import { prisma } from "@/lib/prisma";
import { memCache } from "@/lib/mem-cache";
import type { InsightInput, InsightEvidence } from "@/types";
import {
  Prisma,
  type IgnoredInsight,
  type InsightType,
  type InsightSeverity,
} from "@prisma/client";
import {
  subDays,
  subMonths,
  addDays,
  differenceInCalendarDays,
  getDay,
  format,
} from "date-fns";

// ─── Constants ───────────────────────────────────────────────
const TTL_INSIGHTS = 60 * 60 * 1000; // 1 hour
const STALE_INSIGHT_DAYS = 7;

// Hardcoded subscription-like categories for "subscription bleed" detection
const SUBSCRIPTION_CATEGORIES = [
  "subscription",
  "subscriptions",
  "streaming",
  "software",
  "saas",
  "membership",
  "gym",
  "cloud",
  "hosting",
  "domain",
  "music",
  "video",
  "news",
  "education",
  "learning",
];

// Contact frequency to expected interval mapping (in days)
const CONTACT_INTERVAL: Record<string, number> = {
  daily: 1,
  weekly: 7,
  monthly: 30,
  quarterly: 90,
};

// Day-of-week helpers
type DayOfWeekEnum = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";

const JS_DAY_TO_ENUM: DayOfWeekEnum[] = [
  "SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT",
];

function getEnumDayOfWeek(date: Date): DayOfWeekEnum {
  return JS_DAY_TO_ENUM[getDay(date)];
}

// ─── Helper: upsert insight ──────────────────────────────────
async function upsertInsight(
  input: InsightInput
): Promise<IgnoredInsight | null> {
  try {
    const cutoff = subDays(new Date(), STALE_INSIGHT_DAYS);

    const existing = await prisma.ignoredInsight.findFirst({
      where: {
        userId: input.userId,
        type: input.type,
        createdAt: { gte: cutoff },
        actedOn: false,
        dismissedAt: null,
      },
    });

    const evidenceJson = input.evidence as unknown as Prisma.InputJsonValue;

    if (existing) {
      return prisma.ignoredInsight.update({
        where: { id: existing.id },
        data: {
          title: input.title,
          description: input.description,
          severity: input.severity,
          evidence: evidenceJson,
        },
      });
    }

    return prisma.ignoredInsight.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        description: input.description,
        severity: input.severity,
        evidence: evidenceJson,
      },
    });
  } catch (err) {
    console.error("Failed to upsert insight:", err);
    return null;
  }
}

// ─── 1. Detect Declining Skills ──────────────────────────────
export async function detectDecliningSkills(
  userId: string
): Promise<InsightInput[]> {
  try {
    const now = new Date();
    const currentStart = subDays(now, 90);
    const previousStart = subDays(now, 180);
    const previousEnd = subDays(now, 90);

    const routines = await prisma.routine.findMany({
      where: { userId },
      include: {
        completions: {
          where: { date: { gte: previousStart } },
          select: { date: true },
        },
      },
    });

    const insights: InsightInput[] = [];

    for (const routine of routines) {
      // Count active days in each 90-day window
      let activeDaysCurrent = 0;
      let activeDaysPrevious = 0;

      for (let i = 0; i < 90; i++) {
        const day = subDays(now, i);
        const enumDay = getEnumDayOfWeek(day);
        if (routine.activeDays.includes(enumDay)) {
          activeDaysCurrent++;
        }
      }

      for (let i = 90; i < 180; i++) {
        const day = subDays(now, i);
        const enumDay = getEnumDayOfWeek(day);
        if (routine.activeDays.includes(enumDay)) {
          activeDaysPrevious++;
        }
      }

      if (activeDaysPrevious === 0 || activeDaysCurrent === 0) continue;

      // Count completions in each window
      const currentCompletions = routine.completions.filter(
        (c) => c.date >= currentStart
      ).length;
      const previousCompletions = routine.completions.filter(
        (c) => c.date >= previousStart && c.date < previousEnd
      ).length;

      const currentRate = currentCompletions / activeDaysCurrent;
      const previousRate = previousCompletions / activeDaysPrevious;

      if (previousRate <= 0) continue;

      const dropPercent = (previousRate - currentRate) / previousRate;

      if (dropPercent > 0.5) {
        const severity: InsightSeverity =
          dropPercent > 0.75 ? "critical" : "warning";

        insights.push({
          userId,
          type: "declining_skill",
          title: `Routine "${routine.name}" declining`,
          description: `Completion rate dropped ${Math.round(dropPercent * 100)}% from ${Math.round(previousRate * 100)}% to ${Math.round(currentRate * 100)}% over the last 90 days.`,
          severity,
          evidence: [
            {
              metric: "completion_rate_current",
              value: Math.round(currentRate * 100),
              threshold: Math.round(previousRate * 100),
              context: routine.name,
            },
            {
              metric: "completion_rate_previous",
              value: Math.round(previousRate * 100),
              threshold: "baseline",
              context: routine.name,
            },
            {
              metric: "drop_percent",
              value: Math.round(dropPercent * 100),
              threshold: 50,
              context: `${currentCompletions}/${activeDaysCurrent} vs ${previousCompletions}/${activeDaysPrevious}`,
            },
          ],
        });
      }
    }

    return insights;
  } catch (err) {
    console.error("detectDecliningSkills failed:", err);
    return [];
  }
}

// ─── 2. Detect Burnout Risk ─────────────────────────────────
export async function detectBurnoutRisk(
  userId: string
): Promise<InsightInput[]> {
  try {
    const now = new Date();
    const last14 = subDays(now, 14);
    const prev14Start = subDays(now, 28);

    const indicators: InsightEvidence[] = [];

    // Indicator 1: Task completion rate drop
    const tasksRecent = await prisma.task.findMany({
      where: {
        userId,
        completedAt: { gte: last14 },
      },
      select: { id: true },
    });
    const tasksPrevious = await prisma.task.findMany({
      where: {
        userId,
        completedAt: { gte: prev14Start, lt: last14 },
      },
      select: { id: true },
    });

    const recentTaskCount = tasksRecent.length;
    const previousTaskCount = tasksPrevious.length;

    if (previousTaskCount > 0) {
      const taskDrop =
        (previousTaskCount - recentTaskCount) / previousTaskCount;
      if (taskDrop > 0.3) {
        indicators.push({
          metric: "task_completion_drop",
          value: recentTaskCount,
          threshold: previousTaskCount,
          context: `Tasks completed dropped from ${previousTaskCount} to ${recentTaskCount} in last 14 days`,
        });
      }
    }

    // Indicator 2: Routine breakage
    const routines = await prisma.routine.findMany({
      where: { userId },
      include: {
        completions: {
          where: { date: { gte: last14 } },
          select: { date: true },
        },
      },
    });

    let brokenRoutines = 0;
    for (const routine of routines) {
      let activeDaysInPeriod = 0;
      for (let i = 0; i < 14; i++) {
        const day = subDays(now, i);
        const enumDay = getEnumDayOfWeek(day);
        if (routine.activeDays.includes(enumDay)) {
          activeDaysInPeriod++;
        }
      }
      if (activeDaysInPeriod === 0) continue;
      const rate = routine.completions.length / activeDaysInPeriod;
      if (rate < 0.5) {
        brokenRoutines++;
      }
    }

    if (brokenRoutines > 0) {
      indicators.push({
        metric: "routine_breakage",
        value: brokenRoutines,
        threshold: 1,
        context: `${brokenRoutines} routines below 50% completion in last 14 days`,
      });
    }

    // Indicator 3: Budget stress (convenience spending)
    const budgetEntries = await prisma.budgetEntry.findMany({
      where: {
        userId,
        type: "expense",
        date: { gte: last14 },
      },
      select: { amount: true, category: true },
    });

    const totalSpent = budgetEntries.reduce(
      (sum, e) => sum + Number(e.amount),
      0
    );
    const convenienceSpent = budgetEntries
      .filter((e) =>
        ["food_delivery", "coffee", "convenience", "takeout", "snacks"].includes(
          e.category.toLowerCase()
        )
      )
      .reduce((sum, e) => sum + Number(e.amount), 0);

    if (totalSpent > 0 && convenienceSpent / totalSpent > 0.3) {
      indicators.push({
        metric: "convenience_spending",
        value: Math.round((convenienceSpent / totalSpent) * 100),
        threshold: 30,
        context: `Convenience spending is ${Math.round((convenienceSpent / totalSpent) * 100)}% of total (₹${convenienceSpent.toFixed(0)} of ₹${totalSpent.toFixed(0)})`,
      });
    }

    // Indicator 4: Social isolation
    const people = await prisma.person.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        lastContact: true,
        contactFrequency: true,
      },
    });

    let isolatedCount = 0;
    const isolatedNames: string[] = [];
    for (const person of people) {
      if (!person.contactFrequency) continue;
      const intervalDays = CONTACT_INTERVAL[person.contactFrequency];
      if (!intervalDays) continue;

      const expectedContact = subDays(now, intervalDays * 2);
      if (!person.lastContact || person.lastContact < expectedContact) {
        isolatedCount++;
        isolatedNames.push(person.name);
      }
    }

    if (isolatedCount > 0) {
      indicators.push({
        metric: "social_isolation",
        value: isolatedCount,
        threshold: 1,
        context: `No contact with ${isolatedNames.slice(0, 3).join(", ")}${isolatedNames.length > 3 ? ` and ${isolatedNames.length - 3} more` : ""}`,
      });
    }

    // Indicator 5: Sleep disruption
    const sleepMetrics = await prisma.lifeMetric.findMany({
      where: {
        userId,
        category: "sleep",
        recordedAt: { gte: last14 },
      },
      select: { value: true, recordedAt: true },
    });

    const poorSleepNights = sleepMetrics.filter((m) => m.value < 6).length;
    if (poorSleepNights >= 3) {
      indicators.push({
        metric: "sleep_disruption",
        value: poorSleepNights,
        threshold: 3,
        context: `${poorSleepNights} nights with less than 6 hours sleep in last 14 days`,
      });
    }

    // Evaluate severity
    if (indicators.length < 3) return [];

    const severity: InsightSeverity =
      indicators.length >= 5 ? "critical" : "warning";

    return [
      {
        userId,
        type: "burnout_risk",
        title:
          severity === "critical"
            ? "High burnout risk detected"
            : "Early burnout indicators detected",
        description: `${indicators.length} burnout indicators found in the last 14 days: ${indicators.map((i) => i.metric.replace(/_/g, " ")).join(", ")}.`,
        severity,
        evidence: indicators,
      },
    ];
  } catch (err) {
    console.error("detectBurnoutRisk failed:", err);
    return [];
  }
}

// ─── 3. Detect Missed Opportunities ──────────────────────────
export async function detectMissedOpportunities(
  userId: string
): Promise<InsightInput[]> {
  try {
    const now = new Date();
    const insights: InsightInput[] = [];

    // A. Urgent high-priority tasks not started
    const urgentTasks = await prisma.task.findMany({
      where: {
        userId,
        status: "open",
        priority: 1,
        dueDate: { gte: now, lte: addDays(now, 3) },
        createdAt: { lte: subDays(now, 2) },
      },
      select: { id: true, title: true, dueDate: true },
    });

    if (urgentTasks.length > 0) {
      insights.push({
        userId,
        type: "missed_opportunity",
        title: `${urgentTasks.length} urgent task${urgentTasks.length > 1 ? "s" : ""} due soon`,
        description: `High-priority tasks due within 3 days that haven't been started: ${urgentTasks.map((t) => t.title).slice(0, 3).join(", ")}.`,
        severity: "critical",
        evidence: urgentTasks.map((t) => ({
          metric: "urgent_task_overdue",
          value: t.title,
          threshold: "due within 3 days",
          context: t.dueDate
            ? `Due ${format(t.dueDate, "MMM d")}`
            : "No due date",
        })),
      });
    }

    // B. Assessments due within 7 days with no study notes
    const upcomingAssessments = await prisma.assessment.findMany({
      where: {
        date: { gte: now, lte: addDays(now, 7) },
        course: { semester: { isActive: true } },
      },
      include: {
        course: { select: { id: true, name: true } },
      },
    });

    const assessmentsNeedingNotes: Array<{
      assessment: (typeof upcomingAssessments)[number];
      noteCount: number;
    }> = [];

    for (const assessment of upcomingAssessments) {
      const noteCount = await prisma.note.count({
        where: {
          userId,
          courseId: assessment.courseId,
          createdAt: { gte: subDays(now, 7) },
        },
      });

      if (noteCount === 0) {
        assessmentsNeedingNotes.push({ assessment, noteCount });
      }
    }

    if (assessmentsNeedingNotes.length > 0) {
      const items = assessmentsNeedingNotes.slice(0, 3);
      insights.push({
        userId,
        type: "missed_opportunity",
        title: `${assessmentsNeedingNotes.length} assessment${assessmentsNeedingNotes.length > 1 ? "s" : ""} with no study notes`,
        description: `Assessments due within 7 days with no recent study notes: ${items.map((a) => `${a.assessment.course.name} ${a.assessment.componentType}`).join(", ")}.`,
        severity: "warning",
        evidence: assessmentsNeedingNotes.map((a) => ({
          metric: "assessment_no_notes",
          value: 0,
          threshold: 1,
          context: `${a.assessment.course.name} — ${a.assessment.componentType} due ${a.assessment.date ? format(a.assessment.date, "MMM d") : "soon"}`,
        })),
      });
    }

    // C. People (mentors/network) not contacted in 2x their frequency
    const people = await prisma.person.findMany({
      where: {
        userId,
        relationshipType: { in: ["mentor", "network"] },
      },
      select: {
        id: true,
        name: true,
        lastContact: true,
        contactFrequency: true,
        relationshipType: true,
      },
    });

    const overduePeople: Array<(typeof people)[number] & { overdueDays: number }> = [];

    for (const person of people) {
      if (!person.contactFrequency) continue;
      const intervalDays = CONTACT_INTERVAL[person.contactFrequency];
      if (!intervalDays) continue;

      const expectedBy = subDays(now, intervalDays * 2);
      if (!person.lastContact || person.lastContact < expectedBy) {
        const overdueDays = person.lastContact
          ? differenceInCalendarDays(now, person.lastContact)
          : 999;
        overduePeople.push({ ...person, overdueDays });
      }
    }

    if (overduePeople.length > 0) {
      const items = overduePeople.slice(0, 3);
      insights.push({
        userId,
        type: "missed_opportunity",
        title: `${overduePeople.length} relationship${overduePeople.length > 1 ? "s" : ""} need${overduePeople.length === 1 ? "s" : ""} attention`,
        description: `Mentors/network contacts not reached out to: ${items.map((p) => p.name).join(", ")}.`,
        severity: "warning",
        evidence: overduePeople.map((p) => ({
          metric: "contact_overdue",
          value: p.overdueDays,
          threshold: (CONTACT_INTERVAL[p.contactFrequency || "monthly"] || 30) * 2,
          context: `${p.name} (${p.relationshipType}) — last contact ${p.lastContact ? format(p.lastContact, "MMM d") : "never"}`,
        })),
      });
    }

    return insights;
  } catch (err) {
    console.error("detectMissedOpportunities failed:", err);
    return [];
  }
}

// ─── 4. Detect Energy Mismatch ───────────────────────────────
export async function detectEnergyMismatch(
  userId: string
): Promise<InsightInput[]> {
  try {
    const now = new Date();
    const last30 = subDays(now, 30);

    // Fetch routines with their energy impact and active days
    const routines = await prisma.routine.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        timeOfDay: true,
        energyImpact: true,
        activeDays: true,
      },
    });

    // Build per-day-of-week energy profile
    // For each day-of-week, compute average energy impact:
    //   charging routines count +1, draining count -1, neutral count 0
    const dayEnergyProfile: Record<DayOfWeekEnum, number> = {
      MON: 0, TUE: 0, WED: 0, THU: 0, FRI: 0, SAT: 0, SUN: 0,
    };
    const dayRoutineCount: Record<DayOfWeekEnum, number> = {
      MON: 0, TUE: 0, WED: 0, THU: 0, FRI: 0, SAT: 0, SUN: 0,
    };

    for (const routine of routines) {
      const energyScore =
        routine.energyImpact === "charging"
          ? 1
          : routine.energyImpact === "draining"
            ? -1
            : 0;

      for (const day of routine.activeDays) {
        dayEnergyProfile[day] += energyScore;
        dayRoutineCount[day]++;
      }
    }

    // Normalize: positive = net charging day, negative = net draining day
    const drainingDays = new Set<DayOfWeekEnum>();
    for (const day of Object.keys(dayEnergyProfile) as DayOfWeekEnum[]) {
      const count = dayRoutineCount[day];
      if (count === 0) continue;
      const avgEnergy = dayEnergyProfile[day] / count;
      if (avgEnergy < -0.3) {
        drainingDays.add(day);
      }
    }

    if (drainingDays.size === 0) return [];

    // Fetch completed tasks in last 30 days
    const completedTasks = await prisma.task.findMany({
      where: {
        userId,
        status: "done",
        completedAt: { gte: last30 },
        priority: 1, // high-priority tasks only
      },
      select: {
        id: true,
        title: true,
        completedAt: true,
        courseId: true,
        project: { select: { name: true } },
        course: { select: { name: true } },
      },
    });

    if (completedTasks.length === 0) return [];

    // Check which high-priority tasks were completed on draining days
    const mismatchedTasks: Array<{
      title: string;
      completedAt: Date;
      dayOfWeek: DayOfWeekEnum;
      courseName: string | null;
      projectName: string | null;
    }> = [];

    for (const task of completedTasks) {
      if (!task.completedAt) continue;
      const enumDay = getEnumDayOfWeek(task.completedAt);
      if (drainingDays.has(enumDay)) {
        mismatchedTasks.push({
          title: task.title,
          completedAt: task.completedAt,
          dayOfWeek: enumDay,
          courseName: task.course?.name ?? null,
          projectName: task.project?.name ?? null,
        });
      }
    }

    if (mismatchedTasks.length === 0) return [];

    const mismatchRate = mismatchedTasks.length / completedTasks.length;

    if (mismatchRate < 0.3) return []; // less than 30% mismatched — not significant

    const severity: InsightSeverity =
      mismatchRate > 0.6 ? "critical" : "warning";

    return [
      {
        userId,
        type: "energy_mismatch",
        title: "High-energy tasks scheduled during low-energy periods",
        description: `${mismatchedTasks.length} of ${completedTasks.length} high-priority tasks (${Math.round(mismatchRate * 100)}%) were completed on days with draining energy profiles: ${[...new Set(mismatchedTasks.map((t) => t.dayOfWeek))].join(", ")}.`,
        severity,
        evidence: [
          {
            metric: "mismatch_rate",
            value: Math.round(mismatchRate * 100),
            threshold: 30,
            context: `${mismatchedTasks.length}/${completedTasks.length} high-priority tasks on draining days`,
          },
          {
            metric: "draining_days",
            value: [...drainingDays].join(", "),
            threshold: "none",
            context: `Days with net-draining energy profile: ${[...drainingDays].join(", ")}`,
          },
          ...mismatchedTasks.slice(0, 3).map((t) => ({
            metric: "mismatched_task",
            value: t.title,
            threshold: "charging day",
            context: `Completed on ${t.dayOfWeek} — ${t.courseName || t.projectName || "no course"}`,
          })),
        ],
      },
    ];
  } catch (err) {
    console.error("detectEnergyMismatch failed:", err);
    return [];
  }
}

// ─── 5. Detect Budget Anomalies ──────────────────────────────
export async function detectBudgetAnomalies(
  userId: string
): Promise<InsightInput[]> {
  try {
    const now = new Date();
    const threeMonthsAgo = subMonths(now, 3);

    const entries = await prisma.budgetEntry.findMany({
      where: {
        userId,
        type: "expense",
        date: { gte: threeMonthsAgo },
      },
      select: { amount: true, category: true, date: true },
      orderBy: { date: "asc" },
    });

    if (entries.length === 0) return [];

    // Group by category and month
    const byCategoryMonth: Record<string, Record<string, number>> = {};
    for (const entry of entries) {
      const monthKey = format(entry.date, "yyyy-MM");
      if (!byCategoryMonth[entry.category]) {
        byCategoryMonth[entry.category] = {};
      }
      byCategoryMonth[entry.category][monthKey] =
        (byCategoryMonth[entry.category][monthKey] || 0) + Number(entry.amount);
    }

    const currentMonthKey = format(now, "yyyy-MM");
    const insights: InsightInput[] = [];
    const anomalies: InsightEvidence[] = [];

    // Check each category for >50% increase
    for (const [category, months] of Object.entries(byCategoryMonth)) {
      const currentAmount = months[currentMonthKey] || 0;
      if (currentAmount === 0) continue;

      const pastMonths = Object.entries(months).filter(
        ([key]) => key < currentMonthKey
      );
      if (pastMonths.length === 0) continue;

      const avgPast =
        pastMonths.reduce((sum, [, val]) => sum + val, 0) / pastMonths.length;

      if (avgPast > 0) {
        const increasePercent = (currentAmount - avgPast) / avgPast;
        if (increasePercent > 0.5) {
          anomalies.push({
            metric: "spending_increase",
            value: Math.round(currentAmount),
            threshold: Math.round(avgPast),
            context: `${category}: ₹${currentAmount.toFixed(0)} this month vs ₹${avgPast.toFixed(0)} avg (+${Math.round(increasePercent * 100)}%)`,
          });
        }
      }
    }

    if (anomalies.length > 0) {
      insights.push({
        userId,
        type: "budget_anomaly",
        title: `${anomalies.length} budget categor${anomalies.length > 1 ? "ies" : "y"} with unusual spending`,
        description: `Spending spikes detected: ${anomalies.map((a) => a.context.split(":")[0]).slice(0, 3).join(", ")}.`,
        severity: "warning",
        evidence: anomalies,
      });
    }

    // Subscription bleed detection: categories appearing in 3+ months with similar amounts
    const subscriptionAnomalies: InsightEvidence[] = [];

    for (const [category, months] of Object.entries(byCategoryMonth)) {
      const monthKeys = Object.keys(months).sort();
      if (monthKeys.length < 3) continue;

      const isSubscriptionLike =
        SUBSCRIPTION_CATEGORIES.some((sub) =>
          category.toLowerCase().includes(sub)
        ) ||
        // Also detect: if same category appears every month with ±10% amount
        monthKeys.length >= 3;

      if (!isSubscriptionLike) continue;

      const amounts = monthKeys.map((k) => months[k]);
      const avg = amounts.reduce((s, v) => s + v, 0) / amounts.length;
      const isConsistent =
        avg > 0 && amounts.every((a) => Math.abs(a - avg) / avg < 0.1);

      if (isConsistent && monthKeys.length >= 3) {
        // Check if user might have forgotten about it
        // (no task or event referencing this category recently)
        const recentMentions = await prisma.task.count({
          where: {
            userId,
            OR: [
              { title: { contains: category, mode: "insensitive" } },
              { notes: { contains: category, mode: "insensitive" } },
            ],
            createdAt: { gte: subDays(now, 30) },
          },
        });

        if (recentMentions === 0) {
          subscriptionAnomalies.push({
            metric: "subscription_bleed",
            value: `₹${avg.toFixed(0)}/month`,
            threshold: "3+ months consistent",
            context: `"${category}" — ₹${avg.toFixed(0)}/month for ${monthKeys.length} months with no recent task mentions`,
          });
        }
      }
    }

    if (subscriptionAnomalies.length > 0) {
      insights.push({
        userId,
        type: "budget_anomaly",
        title: "Possible subscription bleed detected",
        description: `${subscriptionAnomalies.length} recurring expense${subscriptionAnomalies.length > 1 ? "s" : ""} that you might have forgotten about.`,
        severity: "info",
        evidence: subscriptionAnomalies,
      });
    }

    return insights;
  } catch (err) {
    console.error("detectBudgetAnomalies failed:", err);
    return [];
  }
}

// ─── 6. Detect Knowledge Gaps ────────────────────────────────
export async function detectKnowledgeGaps(
  userId: string
): Promise<InsightInput[]> {
  try {
    const now = new Date();
    const last30 = subDays(now, 30);

    const activeSemester = await prisma.semester.findFirst({
      where: { isActive: true },
      include: { courses: { select: { id: true, name: true } } },
    });

    if (!activeSemester || activeSemester.courses.length === 0) return [];

    const recentNotes = await prisma.note.findMany({
      where: {
        userId,
        createdAt: { gte: last30 },
      },
      select: { courseId: true, tags: true, content: true },
    });

    // Count notes per course
    const notesByCourse: Record<string, number> = {};
    for (const note of recentNotes) {
      if (note.courseId) {
        notesByCourse[note.courseId] = (notesByCourse[note.courseId] || 0) + 1;
      }
    }

    // Aggregate all note text and tags for frequency analysis
    const allNoteText = recentNotes
      .map((n) => `${n.tags.join(" ")} ${n.content}`)
      .join(" ")
      .toLowerCase();

    const insights: InsightInput[] = [];
    const gaps: InsightEvidence[] = [];

    for (const course of activeSemester.courses) {
      const noteCount = notesByCourse[course.id] || 0;

      if (noteCount <= 1) {
        // Check if the course subject appears in other notes
        const courseWords = course.name
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length > 3);
        const mentionsInOtherNotes = courseWords.filter((w) =>
          allNoteText.includes(w)
        ).length;
        const mentionRatio =
          courseWords.length > 0
            ? mentionsInOtherNotes / courseWords.length
            : 0;

        gaps.push({
          metric: "note_count",
          value: noteCount,
          threshold: 2,
          context: `${course.name}: ${noteCount} notes in last 30 days (subject mentioned in ${Math.round(mentionRatio * 100)}% of other notes)`,
        });
      }
    }

    if (gaps.length > 0) {
      insights.push({
        userId,
        type: "knowledge_gap",
        title: `${gaps.length} course${gaps.length > 1 ? "s" : ""} with insufficient notes`,
        description: `Courses with few or no notes in the last 30 days: ${gaps.map((g) => g.context.split(":")[0]).join(", ")}.`,
        severity: "warning",
        evidence: gaps,
      });
    }

    return insights;
  } catch (err) {
    console.error("detectKnowledgeGaps failed:", err);
    return [];
  }
}

// ─── 7. Detect Focus Fragmentation ───────────────────────────
export async function detectFocusFragmentation(
  userId: string
): Promise<InsightInput[]> {
  try {
    const now = new Date();
    const last30 = subDays(now, 30);
    const last7 = subDays(now, 7);

    const recentTasks = await prisma.task.findMany({
      where: {
        userId,
        createdAt: { gte: last30 },
      },
      select: {
        id: true,
        status: true,
        courseId: true,
        projectId: true,
        domainId: true,
        createdAt: true,
        completedAt: true,
      },
    });

    if (recentTasks.length === 0) return [];

    // Metric 1: Completion rate
    const completedCount = recentTasks.filter(
      (t) => t.status === "done"
    ).length;
    const completionRate = completedCount / recentTasks.length;

    // Metric 2: Creation rate (tasks per day)
    const creationRate = recentTasks.length / 30;

    // Metric 3: Context switching — distinct contexts per day in last 7 days
    const recentOpenTasks = recentTasks.filter(
      (t) => t.status === "open" && t.createdAt >= last7
    );

    const contextByDay: Record<string, Set<string>> = {};
    for (const task of recentOpenTasks) {
      const dayKey = format(task.createdAt, "yyyy-MM-dd");
      if (!contextByDay[dayKey]) {
        contextByDay[dayKey] = new Set();
      }
      // Each unique courseId/projectId/domainId is a context
      const contextKey = [task.courseId, task.projectId, task.domainId]
        .filter(Boolean)
        .join(":");
      if (contextKey) {
        contextByDay[dayKey].add(contextKey);
      }
    }

    const maxContextsInDay = Math.max(
      0,
      ...Object.values(contextByDay).map((s) => s.size)
    );
    const avgContextsPerDay =
      Object.values(contextByDay).reduce((sum, s) => sum + s.size, 0) /
      Math.max(1, Object.keys(contextByDay).length);

    // Metric 4: Tasks started but not completed (stale tasks)
    const staleTasks = recentTasks.filter(
      (t) =>
        t.status === "open" &&
        differenceInCalendarDays(now, t.createdAt) > 7
    ).length;

    const evidence: InsightEvidence[] = [];
    let triggered = false;

    // Check completion rate
    if (completionRate < 0.3 && creationRate > 2) {
      triggered = true;
      evidence.push({
        metric: "low_completion_rate",
        value: Math.round(completionRate * 100),
        threshold: 30,
        context: `${completedCount}/${recentTasks.length} tasks completed in 30 days (${Math.round(creationRate)}/day creation rate)`,
      });
    }

    // Check context switching
    if (maxContextsInDay >= 5) {
      triggered = true;
      evidence.push({
        metric: "context_switches",
        value: maxContextsInDay,
        threshold: 4,
        context: `Up to ${maxContextsInDay} different contexts in a single day (avg: ${avgContextsPerDay.toFixed(1)})`,
      });
    }

    // Check stale tasks
    if (staleTasks > 5) {
      triggered = true;
      evidence.push({
        metric: "stale_tasks",
        value: staleTasks,
        threshold: 5,
        context: `${staleTasks} tasks open for more than 7 days`,
      });
    }

    if (!triggered) return [];

    const severity: InsightSeverity =
      evidence.length >= 2 || completionRate < 0.2 ? "critical" : "warning";

    return [
      {
        userId,
        type: "focus_fragmentation",
        title: "Task focus appears fragmented",
        description: `${recentTasks.length} tasks created in 30 days with ${Math.round(completionRate * 100)}% completion rate and up to ${maxContextsInDay} context switches per day.`,
        severity,
        evidence,
      },
    ];
  } catch (err) {
    console.error("detectFocusFragmentation failed:", err);
    return [];
  }
}

// ─── 8. Generate All Insights (Orchestrator) ─────────────────
export async function generateAllInsights(
  userId: string
): Promise<IgnoredInsight[]> {
  return memCache.get(`insights:${userId}`, TTL_INSIGHTS, async () => {
    try {
      // Run all detectors in parallel
      const [
        decliningSkills,
        burnoutRisk,
        missedOpportunities,
        energyMismatch,
        budgetAnomalies,
        knowledgeGaps,
        focusFragmentation,
      ] = await Promise.all([
        detectDecliningSkills(userId),
        detectBurnoutRisk(userId),
        detectMissedOpportunities(userId),
        detectEnergyMismatch(userId),
        detectBudgetAnomalies(userId),
        detectKnowledgeGaps(userId),
        detectFocusFragmentation(userId),
      ]);

      // Flatten all insights
      const allInsights: InsightInput[] = [
        ...decliningSkills,
        ...burnoutRisk,
        ...missedOpportunities,
        ...energyMismatch,
        ...budgetAnomalies,
        ...knowledgeGaps,
        ...focusFragmentation,
      ];

      // Deduplicate by type — keep highest severity if duplicate types
      const severityOrder: Record<InsightSeverity, number> = {
        critical: 3,
        warning: 2,
        info: 1,
      };

      const deduped = new Map<InsightType, InsightInput>();
      for (const insight of allInsights) {
        const existing = deduped.get(insight.type);
        if (
          !existing ||
          severityOrder[insight.severity] >
            severityOrder[existing.severity]
        ) {
          deduped.set(insight.type, insight);
        }
      }

      // Sort by severity (critical first), then by evidence count
      const sorted = [...deduped.values()].sort((a, b) => {
        const sevDiff =
          severityOrder[b.severity] - severityOrder[a.severity];
        if (sevDiff !== 0) return sevDiff;
        return b.evidence.length - a.evidence.length;
      });

      // Limit to top 5
      const top5 = sorted.slice(0, 5);

      // Persist each insight to database
      const persisted = await Promise.all(top5.map(upsertInsight));

      return persisted.filter((r): r is IgnoredInsight => r !== null);
    } catch (err) {
      console.error("generateAllInsights failed:", err);
      return [];
    }
  });
}
