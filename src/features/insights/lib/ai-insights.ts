import { prisma } from "@/lib/prisma";
import { memCache } from "@/lib/mem-cache";
import { askAI } from "@/lib/ai/openrouter";
import {
  Prisma,
  type IgnoredInsight,
  type InsightType,
  type InsightSeverity,
} from "@prisma/client";
import { subDays, format } from "date-fns";

// ─── Constants ───────────────────────────────────────────────
const TTL_AI_INSIGHTS = 24 * 60 * 60 * 1000; // 24 hours
const STALE_INSIGHT_DAYS = 7;

const SYSTEM_PROMPT = `You are a behavioral intelligence analyst examining a student's life data.
Analyze the following data and identify 3-5 NON-OBVIOUS patterns the student is likely ignoring.
These should be insights that require connecting dots across different life areas.

RULES:
- Focus on COUNTER-INTUITIVE insights (not "you have overdue tasks")
- Connect different domains (e.g., "Your budget overspending on food correlates with task deadline weeks")
- Identify TRENDS, not just current state
- Suggest SPECIFIC, ACTIONABLE changes
- Rate severity: info (interesting), warning (needs attention), critical (urgent)
- INCLUDE 1-2 POSITIVE insights — recognize progress, streaks, improvements, and wins. Use severity "positive" for these.
- For positive insights, be specific about what improved and why it matters

OUTPUT FORMAT:
Return a JSON array of insights. No markdown, no backticks, no explanation — ONLY the JSON array.
Each insight must have: type, title, description, severity, evidence (array of objects with metric, value, threshold, context).

Valid types: declining_skill, burnout_risk, missed_opportunity, relationship_drift, budget_anomaly, knowledge_gap, focus_fragmentation, achievement, positive_trend, streak_milestone
Valid severities: info, warning, critical, positive`;

// ─── Data Summary Builder ────────────────────────────────────
async function buildDataSummary(userId: string): Promise<string> {
  const now = new Date();
  const last30 = subDays(now, 30);
  const last14 = subDays(now, 14);

  const [
    tasks,
    routines,
    budgetEntries,
    notes,
    attendanceRecords,
    people,
    assessments,
    projects,
    sleepMetrics,
  ] = await Promise.all([
    // Tasks: last 30 days
    prisma.task.findMany({
      where: { userId, createdAt: { gte: last30 } },
      select: {
        title: true,
        status: true,
        priority: true,
        dueDate: true,
        courseId: true,
        completedAt: true,
      },
      orderBy: [{ priority: "asc" }, { dueDate: "asc" }],
      take: 20,
    }),

    // Routines with completions: last 14 days
    prisma.routine.findMany({
      where: { userId },
      select: {
        name: true,
        activeDays: true,
        category: true,
        completions: {
          where: { date: { gte: last14 } },
          select: { date: true },
        },
      },
    }),

    // Budget: last 30 days
    prisma.budgetEntry.findMany({
      where: { userId, date: { gte: last30 } },
      select: { amount: true, category: true, type: true, date: true },
      orderBy: { date: "desc" },
    }),

    // Notes: last 30 days
    prisma.note.findMany({
      where: { userId, createdAt: { gte: last30 } },
      select: { tags: true, courseId: true, createdAt: true },
    }),

    // Attendance: active semester
    prisma.attendanceRecord.findMany({
      where: { course: { semester: { isActive: true } } },
      select: { status: true, course: { select: { name: true, code: true } } },
    }),

    // People
    prisma.person.findMany({
      where: { userId },
      select: {
        name: true,
        lastContact: true,
        contactFrequency: true,
        relationshipType: true,
      },
    }),

    // Assessments: active semester
    prisma.assessment.findMany({
      where: { course: { semester: { isActive: true } } },
      select: {
        componentType: true,
        maxMarks: true,
        obtainedMarks: true,
        date: true,
        course: { select: { name: true, code: true } },
      },
    }),

    // Active projects with milestones
    prisma.project.findMany({
      where: { domain: { userId }, status: "active" },
      select: {
        name: true,
        updatedAt: true,
        milestones: { select: { name: true, isDone: true } },
      },
    }),

    // Sleep metrics: last 14 days
    prisma.lifeMetric.findMany({
      where: { userId, category: "sleep", recordedAt: { gte: last14 } },
      select: { value: true, recordedAt: true },
      orderBy: { recordedAt: "desc" },
    }),
  ]);

  const lines: string[] = [];

  // ── Tasks ──
  const completedTasks = tasks.filter((t) => t.status === "done").length;
  const openTasks = tasks.filter((t) => t.status === "open");
  const overdueTasks = openTasks.filter(
    (t) => t.dueDate && t.dueDate < now
  ).length;
  const highPriorityOpen = openTasks
    .filter((t) => t.priority === 1)
    .slice(0, 5);

  lines.push(`== TASKS (last 30 days) ==`);
  lines.push(
    `Created: ${tasks.length} | Completed: ${completedTasks} (${tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0}%)`
  );
  if (overdueTasks > 0) lines.push(`Overdue: ${overdueTasks}`);
  if (highPriorityOpen.length > 0) {
    lines.push(
      `High priority open: ${highPriorityOpen.map((t) => `"${t.title}"${t.dueDate ? ` (due ${format(t.dueDate, "MMM d")})` : ""}`).join(", ")}`
    );
  }

  // ── Routines ──
  lines.push(`\n== ROUTINES (last 14 days) ==`);
  if (routines.length === 0) {
    lines.push("No routines configured");
  } else {
    for (const r of routines) {
      let activeDaysInPeriod = 0;
      for (let i = 0; i < 14; i++) {
        const day = subDays(now, i);
        const dayNames = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
        if (r.activeDays.includes(dayNames[day.getDay()] as "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN")) {
          activeDaysInPeriod++;
        }
      }
      const rate =
        activeDaysInPeriod > 0
          ? Math.round((r.completions.length / activeDaysInPeriod) * 100)
          : 0;
      lines.push(
        `${r.name}: ${rate}% adherence (${r.completions.length}/${activeDaysInPeriod} active days)`
      );
    }
  }

  // ── Budget ──
  const expenses = budgetEntries.filter((e) => e.type === "expense");
  const totalSpent = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const categoryTotals: Record<string, number> = {};
  for (const e of expenses) {
    categoryTotals[e.category] =
      (categoryTotals[e.category] || 0) + Number(e.amount);
  }
  const topCategories = Object.entries(categoryTotals)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  lines.push(`\n== BUDGET (last 30 days) ==`);
  lines.push(`Total spent: ₹${totalSpent.toFixed(0)}`);
  if (topCategories.length > 0) {
    lines.push(
      `Top categories: ${topCategories.map(([cat, amt]) => `${cat} ₹${amt.toFixed(0)}`).join(", ")}`
    );
  }

  // ── Notes ──
  const tagFrequency: Record<string, number> = {};
  for (const n of notes) {
    for (const tag of n.tags) {
      tagFrequency[tag] = (tagFrequency[tag] || 0) + 1;
    }
  }
  const topTags = Object.entries(tagFrequency)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8);

  lines.push(`\n== NOTES (last 30 days) ==`);
  lines.push(`${notes.length} notes`);
  if (topTags.length > 0) {
    lines.push(
      `Top tags: ${topTags.map(([tag, count]) => `${tag} (${count})`).join(", ")}`
    );
  }

  // ── Attendance ──
  const attendanceByCourse: Record<
    string,
    { present: number; absent: number; name: string }
  > = {};
  for (const r of attendanceRecords) {
    const key = r.course.code || r.course.name;
    if (!attendanceByCourse[key]) {
      attendanceByCourse[key] = { present: 0, absent: 0, name: r.course.name };
    }
    if (r.status === "present") attendanceByCourse[key].present++;
    if (r.status === "absent") attendanceByCourse[key].absent++;
  }

  lines.push(`\n== ATTENDANCE (active semester) ==`);
  for (const [code, data] of Object.entries(attendanceByCourse)) {
    const total = data.present + data.absent;
    const pct = total > 0 ? Math.round((data.present / total) * 100) : 0;
    lines.push(`${code}: ${pct}% (${data.present}/${total} present)`);
  }

  // ── People ──
  lines.push(`\n== PEOPLE ==`);
  if (people.length === 0) {
    lines.push("No people tracked");
  } else {
    const contactInterval: Record<string, number> = {
      daily: 1,
      weekly: 7,
      monthly: 30,
      quarterly: 90,
    };
    for (const p of people) {
      const daysSinceContact = p.lastContact
        ? Math.floor(
            (now.getTime() - p.lastContact.getTime()) / (1000 * 60 * 60 * 24)
          )
        : 999;
      const expected = p.contactFrequency
        ? contactInterval[p.contactFrequency] || 30
        : null;
      const overdue = expected ? daysSinceContact > expected * 2 : false;
      lines.push(
        `${p.name} (${p.relationshipType || "unknown"}): last contact ${daysSinceContact}d ago${overdue ? " ← OVERDUE" : ""}`
      );
    }
  }

  // ── Assessments ──
  const graded = assessments.filter((a) => a.obtainedMarks !== null);
  if (graded.length > 0) {
    lines.push(`\n== ASSESSMENTS (graded) ==`);
    for (const a of graded) {
      lines.push(
        `${a.course.code || a.course.name} ${a.componentType.replace("_", "/")}: ${a.obtainedMarks}/${a.maxMarks} (${Math.round(((a.obtainedMarks || 0) / a.maxMarks) * 100)}%)`
      );
    }
  }

  // ── Projects ──
  if (projects.length > 0) {
    lines.push(`\n== PROJECTS (active) ==`);
    for (const p of projects) {
      const done = p.milestones.filter((m) => m.isDone).length;
      const total = p.milestones.length;
      const daysSinceUpdate = Math.floor(
        (now.getTime() - p.updatedAt.getTime()) / (1000 * 60 * 60 * 24)
      );
      lines.push(
        `${p.name}: ${total > 0 ? Math.round((done / total) * 100) : 0}% (${done}/${total} milestones, last updated ${daysSinceUpdate}d ago)`
      );
    }
  }

  // ── Sleep ──
  if (sleepMetrics.length > 0) {
    const avgSleep =
      sleepMetrics.reduce((s, m) => s + m.value, 0) / sleepMetrics.length;
    const poorNights = sleepMetrics.filter((m) => m.value < 6).length;
    lines.push(`\n== SLEEP (last 14 days) ==`);
    lines.push(
      `Avg: ${avgSleep.toFixed(1)} hours | Below 6h: ${poorNights} nights (${Math.round((poorNights / sleepMetrics.length) * 100)}%)`
    );
  }

  return lines.join("\n");
}

// ─── AI Insight Generation ───────────────────────────────────
export async function generateAIInsights(
  userId: string
): Promise<IgnoredInsight[]> {
  return memCache.get(`ai-insights:${userId}`, TTL_AI_INSIGHTS, async () => {
    try {
      const dataSummary = await buildDataSummary(userId);
      if (!dataSummary.trim()) return [];

      const result = await askAI(
        [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Analyze this student's data and find 3-5 non-obvious patterns:\n\n${dataSummary}`,
          },
        ],
        "ai-insights-generation",
        { temperature: 0.4, maxTokens: 1024 }
      );

      if (!result.ok) {
        console.error("AI insights generation failed:", result.error);
        return [];
      }

      // Parse JSON response
      let parsed: Array<{
        type: string;
        title: string;
        description: string;
        severity: string;
        evidence: Array<{
          metric: string;
          value: string | number;
          threshold: string | number;
          context: string;
        }>;
      }> = [];

      try {
        const jsonMatch = result.data.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        }
      } catch {
        console.error("Failed to parse AI insights JSON");
        return [];
      }

      // Validate and filter
      const validTypes = new Set([
        "declining_skill",
        "burnout_risk",
        "missed_opportunity",
        "relationship_drift",
        "budget_anomaly",
        "knowledge_gap",
        "focus_fragmentation",
        "achievement",
        "positive_trend",
        "streak_milestone",
      ]);
      const validSeverities = new Set(["info", "warning", "critical", "positive"]);

      const validInsights = parsed.filter(
        (i) =>
          i.type &&
          validTypes.has(i.type) &&
          i.title &&
          i.description &&
          i.severity &&
          validSeverities.has(i.severity) &&
          Array.isArray(i.evidence)
      );

      if (validInsights.length === 0) return [];

      // Persist each insight
      const now = new Date();
      const cutoff = subDays(now, STALE_INSIGHT_DAYS);

      const persisted = await Promise.all(
        validInsights.map(async (insight) => {
          const evidenceWithSource = [
            ...insight.evidence,
            {
              metric: "source",
              value: "ai",
              threshold: "n/a",
              context: "AI-generated insight",
            },
          ];

          const evidenceJson =
            evidenceWithSource as unknown as Prisma.InputJsonValue;

          // Check for existing insight of same type within 7 days
          const existing = await prisma.ignoredInsight.findFirst({
            where: {
              userId,
              type: insight.type as InsightType,
              createdAt: { gte: cutoff },
              actedOn: false,
              dismissedAt: null,
            },
          });

          if (existing) {
            return prisma.ignoredInsight.update({
              where: { id: existing.id },
              data: {
                title: insight.title,
                description: insight.description,
                severity: insight.severity as InsightSeverity,
                evidence: evidenceJson,
              },
            });
          }

          return prisma.ignoredInsight.create({
            data: {
              userId,
              type: insight.type as InsightType,
              title: insight.title,
              description: insight.description,
              severity: insight.severity as InsightSeverity,
              evidence: evidenceJson,
            },
          });
        })
      );

      return persisted.filter((r): r is IgnoredInsight => r !== null);
    } catch (err) {
      console.error("generateAIInsights failed:", err);
      return [];
    }
  });
}

// ─── Combine Rule-Based and AI Insights ──────────────────────
export function combineInsights(
  ruleBased: IgnoredInsight[],
  aiBased: IgnoredInsight[]
): IgnoredInsight[] {
  const severityOrder: Record<string, number> = {
    critical: 3,
    warning: 2,
    positive: 1.5,
    info: 1,
  };

  // AI first so it wins dedup
  const combined = [...aiBased, ...ruleBased];
  const deduped = new Map<string, IgnoredInsight>();

  for (const insight of combined) {
    // Dedup key: type + first 30 chars of title (lowercased)
    const key = `${insight.type}:${insight.title.toLowerCase().slice(0, 30)}`;
    if (!deduped.has(key)) {
      deduped.set(key, insight);
    }
  }

  return [...deduped.values()]
    .sort((a, b) => {
      // Severity first
      const sevDiff =
        (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0);
      if (sevDiff !== 0) return sevDiff;

      // Then prefer AI-generated (has source=ai in evidence)
      const aIsAI = Array.isArray(a.evidence) &&
        (a.evidence as unknown as Array<{ metric: string }>).some(
          (e) => e.metric === "source"
        );
      const bIsAI = Array.isArray(b.evidence) &&
        (b.evidence as unknown as Array<{ metric: string }>).some(
          (e) => e.metric === "source"
        );
      if (aIsAI && !bIsAI) return -1;
      if (!aIsAI && bIsAI) return 1;

      return 0;
    })
    .slice(0, 5);
}
