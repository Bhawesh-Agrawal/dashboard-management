import { prisma } from "@/lib/prisma";
import type { ReviewType } from "@prisma/client";
import {
  subDays,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  format,
  differenceInCalendarDays,
  getDay,
} from "date-fns";
import type { ReviewDataSummary } from "./types";

type DayOfWeekEnum = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";
const JS_DAY_TO_ENUM: DayOfWeekEnum[] = [
  "SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT",
];

export function getPeriodBounds(
  type: ReviewType,
  date: Date
): { periodStart: Date; periodEnd: Date } {
  switch (type) {
    case "daily": {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      return { periodStart: start, periodEnd: end };
    }
    case "weekly":
      return {
        periodStart: startOfWeek(date, { weekStartsOn: 1 }),
        periodEnd: endOfWeek(date, { weekStartsOn: 1 }),
      };
    case "monthly":
      return {
        periodStart: startOfMonth(date),
        periodEnd: endOfMonth(date),
      };
    case "quarterly":
      return {
        periodStart: startOfQuarter(date),
        periodEnd: endOfQuarter(date),
      };
  }
}

export async function fetchReviewData(
  userId: string,
  type: ReviewType,
  date: Date
): Promise<ReviewDataSummary> {
  const { periodStart, periodEnd } = getPeriodBounds(type, date);

  const lookbackDays =
    type === "daily"
      ? 2
      : type === "weekly"
        ? 7
        : type === "monthly"
          ? 30
          : 90;
  const lookbackStart = subDays(periodStart, lookbackDays);

  const [
    tasks,
    routinesWithCompletions,
    lifeMetrics,
    attendanceRecords,
    budgetEntries,
    notes,
    assessments,
    projects,
    people,
    identities,
    ignoredInsights,
    classSchedules,
  ] = await Promise.all([
    prisma.task.findMany({
      where: {
        userId,
        OR: [
          { createdAt: { gte: lookbackStart, lte: periodEnd } },
          { dueDate: { gte: lookbackStart, lte: periodEnd } },
          { completedAt: { gte: lookbackStart, lte: periodEnd } },
        ],
      },
      select: {
        title: true,
        status: true,
        priority: true,
        dueDate: true,
        completedAt: true,
        energyRequirement: true,
        optimalTimeOfDay: true,
        course: { select: { name: true } },
        project: { select: { name: true } },
      },
      orderBy: [{ priority: "asc" }, { dueDate: "asc" }],
    }),

    prisma.routine.findMany({
      where: { userId },
      select: {
        name: true,
        energyImpact: true,
        activeDays: true,
        category: true,
        identity: { select: { statement: true } },
        completions: {
          where: { date: { gte: lookbackStart, lte: periodEnd } },
          select: { date: true },
        },
      },
    }),

    prisma.lifeMetric.findMany({
      where: {
        userId,
        recordedAt: { gte: lookbackStart, lte: periodEnd },
      },
      select: { category: true, value: true, recordedAt: true },
      orderBy: { recordedAt: "desc" },
    }),

    prisma.attendanceRecord.findMany({
      where: {
        course: { semester: { isActive: true } },
        date: { gte: periodStart, lte: periodEnd },
      },
      select: {
        status: true,
        date: true,
        course: { select: { name: true, code: true } },
      },
    }),

    prisma.budgetEntry.findMany({
      where: {
        userId,
        date: { gte: lookbackStart, lte: periodEnd },
      },
      select: { amount: true, category: true, type: true, date: true },
      orderBy: { date: "desc" },
    }),

    prisma.note.findMany({
      where: {
        userId,
        createdAt: { gte: lookbackStart, lte: periodEnd },
      },
      select: { tags: true, courseId: true, createdAt: true },
    }),

    prisma.assessment.findMany({
      where: {
        course: { semester: { isActive: true } },
      },
      select: {
        componentType: true,
        maxMarks: true,
        obtainedMarks: true,
        date: true,
        course: { select: { name: true, code: true } },
      },
    }),

    prisma.project.findMany({
      where: { domain: { userId } },
      select: {
        name: true,
        status: true,
        updatedAt: true,
        milestones: { select: { name: true, isDone: true } },
      },
    }),

    prisma.person.findMany({
      where: { userId },
      select: {
        name: true,
        lastContact: true,
        contactFrequency: true,
        relationshipType: true,
        energyImpact: true,
      },
    }),

    prisma.identity.findMany({
      where: { userId },
      select: {
        statement: true,
        status: true,
        routines: { select: { name: true } },
      },
    }),

    prisma.ignoredInsight.findMany({
      where: {
        userId,
        createdAt: { gte: lookbackStart, lte: periodEnd },
      },
      select: {
        title: true,
        description: true,
        severity: true,
        type: true,
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    
    prisma.classSchedule.findMany({
      where: {
        course: { semester: { isActive: true, userId } },
      },
      select: {
        dayOfWeek: true,
        startTime: true,
        endTime: true,
        location: true,
        course: { select: { name: true, code: true } },
      },
      orderBy: { startTime: "asc" },
    }),
  ]);

  const dayEnum = JS_DAY_TO_ENUM[getDay(date)] as any;
  const classes = type === "daily"
    ? classSchedules
        .filter((c) => c.dayOfWeek === dayEnum)
        .map((c) => ({
          courseName: c.course.name,
          courseCode: c.course.code,
          startTime: c.startTime,
          endTime: c.endTime,
          location: c.location,
        }))
    : [];

  return {
    tasks: tasks.map((t) => ({
      title: t.title,
      status: t.status,
      priority: t.priority,
      dueDate: t.dueDate,
      completedAt: t.completedAt,
      energyRequirement: t.energyRequirement,
      optimalTimeOfDay: t.optimalTimeOfDay,
      courseName: t.course?.name ?? null,
      projectName: t.project?.name ?? null,
    })),
    routines: routinesWithCompletions.map((r) => ({
      name: r.name,
      energyImpact: r.energyImpact,
      activeDays: r.activeDays,
      category: r.category,
      completions: r.completions.map((c) => c.date),
      identityName: r.identity?.statement ?? null,
    })),
    lifeMetrics: lifeMetrics.map((m) => ({
      category: m.category,
      value: m.value,
      recordedAt: m.recordedAt,
    })),
    attendance: attendanceRecords.map((a) => ({
      courseName: a.course.name,
      courseCode: a.course.code,
      status: a.status,
      date: a.date,
    })),
    budget: budgetEntries.map((b) => ({
      amount: Number(b.amount),
      category: b.category,
      type: b.type,
      date: b.date,
    })),
    notes: notes.map((n) => ({
      tags: n.tags,
      courseId: n.courseId,
      createdAt: n.createdAt,
    })),
    assessments: assessments.map((a) => ({
      componentType: a.componentType,
      maxMarks: a.maxMarks,
      obtainedMarks: a.obtainedMarks,
      date: a.date,
      courseName: a.course.name,
      courseCode: a.course.code,
    })),
    projects: projects.map((p) => ({
      name: p.name,
      status: p.status,
      updatedAt: p.updatedAt,
      milestones: p.milestones,
    })),
    people: people.map((p) => ({
      name: p.name,
      lastContact: p.lastContact,
      contactFrequency: p.contactFrequency,
      relationshipType: p.relationshipType,
      energyImpact: p.energyImpact,
    })),
    identities: identities.map((i) => ({
      statement: i.statement,
      status: i.status,
      routines: i.routines.map((r) => r.name),
    })),
    ignoredInsights: ignoredInsights.map((ins) => ({
      title: ins.title,
      description: ins.description,
      severity: ins.severity,
      type: ins.type,
    })),
    classes,
    periodStart,
    periodEnd,
  };
}

export function formatReviewDataSummary(
  data: ReviewDataSummary,
  type: ReviewType
): string {
  const now = new Date();
  const lines: string[] = [];

  // ── Tasks ──
  const completedTasks = data.tasks.filter((t) => t.status === "done");
  const openTasks = data.tasks.filter((t) => t.status === "open");
  const overdueTasks = openTasks.filter(
    (t) => t.dueDate && t.dueDate < now
  );

  lines.push(`== TASKS (${type} period) ==`);
  lines.push(
    `Total: ${data.tasks.length} | Completed: ${completedTasks.length} | Open: ${openTasks.length} | Overdue: ${overdueTasks.length}`
  );
  lines.push(
    `Completion rate: ${data.tasks.length > 0 ? Math.round((completedTasks.length / data.tasks.length) * 100) : 0}%`
  );

  if (type === "daily") {
    const relevantTasks = openTasks.filter((t) => !t.dueDate || t.dueDate <= data.periodEnd);
    if (relevantTasks.length > 0) {
      lines.push(
        `Tasks to focus on: ${relevantTasks.slice(0, 10).map((t) => `"${t.title}"${t.dueDate ? ` (due ${format(t.dueDate, "MMM d")})` : ""}`).join(", ")}`
      );
    } else {
      lines.push(`No specific tasks due today.`);
    }
    
    lines.push(`\n== TODAY'S SCHEDULE ==`);
    if (data.classes.length === 0) {
      lines.push("No classes scheduled today.");
    } else {
      for (const c of data.classes) {
        lines.push(`- ${c.startTime}-${c.endTime}: ${c.courseName} (${c.courseCode || ""}) ${c.location ? `at ${c.location}` : ""}`);
      }
    }
  } else {
    const highPriorityOpen = openTasks
      .filter((t) => t.priority === 1)
      .slice(0, 5);
    if (highPriorityOpen.length > 0) {
      lines.push(
        `High priority open: ${highPriorityOpen.map((t) => `"${t.title}"${t.dueDate ? ` (due ${format(t.dueDate, "MMM d")})` : ""}`).join(", ")}`
      );
    }

    const energyTasks = completedTasks.filter((t) => t.energyRequirement);
    if (energyTasks.length > 0) {
      const byEnergy: Record<string, number> = {};
      for (const t of energyTasks) {
        byEnergy[t.energyRequirement!] = (byEnergy[t.energyRequirement!] || 0) + 1;
      }
      lines.push(
        `Energy distribution: ${Object.entries(byEnergy).map(([e, c]) => `${e}=${c}`).join(", ")}`
      );
    }

    const timeOfDayTasks = completedTasks.filter((t) => t.optimalTimeOfDay);
    if (timeOfDayTasks.length > 0) {
      const byTime: Record<string, number> = {};
      for (const t of timeOfDayTasks) {
        byTime[t.optimalTimeOfDay!] = (byTime[t.optimalTimeOfDay!] || 0) + 1;
      }
      lines.push(
        `Time-of-day completion: ${Object.entries(byTime).map(([t, c]) => `${t}=${c}`).join(", ")}`
      );
    }
  }

  // ── Routines ──
  lines.push(`\n== ROUTINES ==`);
  if (data.routines.length === 0) {
    lines.push("No routines configured");
  } else {
    for (const r of data.routines) {
      let activeDaysInPeriod = 0;
      const periodDays = differenceInCalendarDays(data.periodEnd, data.periodStart) + 1;
      for (let i = 0; i < periodDays; i++) {
        const day = new Date(data.periodStart);
        day.setDate(day.getDate() + i);
        const dayEnum = JS_DAY_TO_ENUM[getDay(day)];
        if (r.activeDays.includes(dayEnum)) {
          activeDaysInPeriod++;
        }
      }
      const rate =
        activeDaysInPeriod > 0
          ? Math.round((r.completions.length / activeDaysInPeriod) * 100)
          : 0;
      lines.push(
        `${r.name}: ${rate}% adherence (${r.completions.length}/${activeDaysInPeriod} active days) | energy: ${r.energyImpact}${r.identityName ? ` | identity: ${r.identityName}` : ""}`
      );
    }
  }

  // ── Life Metrics ──
  if (data.lifeMetrics.length > 0) {
    lines.push(`\n== LIFE METRICS ==`);
    const byCategory: Record<string, number[]> = {};
    for (const m of data.lifeMetrics) {
      if (!byCategory[m.category]) byCategory[m.category] = [];
      byCategory[m.category].push(m.value);
    }
    for (const [cat, values] of Object.entries(byCategory)) {
      const avg = values.reduce((s, v) => s + v, 0) / values.length;
      lines.push(`${cat}: avg=${avg.toFixed(1)} (n=${values.length})`);
    }
  }

  // ── Attendance ──
  if (data.attendance.length > 0) {
    lines.push(`\n== ATTENDANCE ==`);
    const byCourse: Record<string, { present: number; absent: number; name: string }> = {};
    for (const a of data.attendance) {
      const key = a.courseCode || a.courseName;
      if (!byCourse[key]) byCourse[key] = { present: 0, absent: 0, name: a.courseName };
      if (a.status === "present") byCourse[key].present++;
      if (a.status === "absent") byCourse[key].absent++;
    }
    for (const [code, d] of Object.entries(byCourse)) {
      const total = d.present + d.absent;
      const pct = total > 0 ? Math.round((d.present / total) * 100) : 0;
      lines.push(`${code}: ${pct}% (${d.present}/${total} present)`);
    }
  }

  // ── Budget ──
  if (data.budget.length > 0) {
    lines.push(`\n== BUDGET ==`);
    const expenses = data.budget.filter((e) => e.type === "expense");
    const income = data.budget.filter((e) => e.type === "income");
    const totalSpent = expenses.reduce((s, e) => s + e.amount, 0);
    const totalIncome = income.reduce((s, e) => s + e.amount, 0);
    lines.push(`Spent: ₹${totalSpent.toFixed(0)} | Income: ₹${totalIncome.toFixed(0)} | Net: ₹${(totalIncome - totalSpent).toFixed(0)}`);

    const byCategory: Record<string, number> = {};
    for (const e of expenses) {
      byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
    }
    const topCategories = Object.entries(byCategory)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);
    if (topCategories.length > 0) {
      lines.push(
        `Top categories: ${topCategories.map(([c, a]) => `${c} ₹${a.toFixed(0)}`).join(", ")}`
      );
    }
  }

  // ── Notes ──
  lines.push(`\n== NOTES ==`);
  lines.push(`${data.notes.length} notes created`);
  if (data.notes.length > 0) {
    const tagFreq: Record<string, number> = {};
    for (const n of data.notes) {
      for (const tag of n.tags) {
        tagFreq[tag] = (tagFreq[tag] || 0) + 1;
      }
    }
    const topTags = Object.entries(tagFreq)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8);
    if (topTags.length > 0) {
      lines.push(
        `Top tags: ${topTags.map(([t, c]) => `${t}(${c})`).join(", ")}`
      );
    }
  }

  // ── Assessments ──
  const graded = data.assessments.filter((a) => a.obtainedMarks !== null);
  if (graded.length > 0) {
    lines.push(`\n== ASSESSMENTS (graded) ==`);
    for (const a of graded) {
      lines.push(
        `${a.courseCode || a.courseName} ${a.componentType}: ${a.obtainedMarks}/${a.maxMarks} (${Math.round(((a.obtainedMarks || 0) / a.maxMarks) * 100)}%)`
      );
    }
  }

  // ── Projects ──
  if (data.projects.length > 0) {
    lines.push(`\n== PROJECTS ==`);
    for (const p of data.projects) {
      const done = p.milestones.filter((m) => m.isDone).length;
      const total = p.milestones.length;
      const daysSinceUpdate = differenceInCalendarDays(now, p.updatedAt);
      lines.push(
        `${p.name} (${p.status}): ${total > 0 ? Math.round((done / total) * 100) : 0}% (${done}/${total} milestones, updated ${daysSinceUpdate}d ago)`
      );
    }
  }

  // ── People ──
  if (data.people.length > 0) {
    lines.push(`\n== PEOPLE ==`);
    const contactInterval: Record<string, number> = {
      daily: 1, weekly: 7, monthly: 30, quarterly: 90,
    };
    for (const p of data.people) {
      const daysSinceContact = p.lastContact
        ? differenceInCalendarDays(now, p.lastContact)
        : 999;
      const expected = p.contactFrequency ? contactInterval[p.contactFrequency] || 30 : null;
      const overdue = expected ? daysSinceContact > expected * 2 : false;
      lines.push(
        `${p.name} (${p.relationshipType || "unknown"}): ${daysSinceContact}d ago${overdue ? " ← OVERDUE" : ""} | energy: ${p.energyImpact}`
      );
    }
  }

  // ── Identities ──
  if (data.identities.length > 0) {
    lines.push(`\n== IDENTITIES ==`);
    for (const i of data.identities) {
      lines.push(
        `"${i.statement}" [${i.status}] — routines: ${i.routines.length > 0 ? i.routines.join(", ") : "none"}`
      );
    }
  }

  // ── Ignored Insights ──
  if (data.ignoredInsights.length > 0) {
    lines.push(`\n== IGNORED INSIGHTS ==`);
    for (const ins of data.ignoredInsights) {
      lines.push(`[${ins.severity}] ${ins.title}: ${ins.description.slice(0, 100)}`);
    }
  }

  return lines.join("\n");
}
