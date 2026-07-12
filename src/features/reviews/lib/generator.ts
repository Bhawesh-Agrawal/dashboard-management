import { prisma } from "@/lib/prisma";
import { askAI } from "@/lib/ai/openrouter";
import type { ReviewType } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { format } from "date-fns";
import { getReviewPrompt } from "./prompts";
import { fetchReviewData, formatReviewDataSummary, getPeriodBounds } from "./data-summary";
import type { ParsedReview, ReviewSection, ActionItem, ReviewMetrics } from "./types";

export const FALLBACK_MARKER = "AI synthesis unavailable";

// ─── Fallback when AI fails ────────────────────────────────
function createFallbackReview(
  type: ReviewType,
  periodStart: Date,
  _periodEnd: Date
): ParsedReview {
  return {
    summary: `${type} review for ${format(periodStart, "MMM d, yyyy")}. ${FALLBACK_MARKER}`,
    sections: [
      {
        title: "Generation Error",
        content: "The review could not be generated properly. Please try regenerating.",
        order: 0,
      },
    ],
    actions: [],
    metrics: {
      tasksCompleted: 0,
      tasksTotal: 0,
      completionRate: 0,
      routineAdherence: 0,
    },
  };
}

export function isFallbackReview(summary: string): boolean {
  return summary.includes(FALLBACK_MARKER);
}

// ─── Parse AI JSON response ────────────────────────────────
function extractJsonObject(raw: string): string | null {
  const start = raw.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return null;
}

function parseAIResponse(raw: string): ParsedReview {
  let jsonStr: string | null = null;

  const codeBlockMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  } else {
    jsonStr = extractJsonObject(raw);
  }

  if (!jsonStr) {
    throw new Error("No JSON object found in AI response");
  }

  const parsed = JSON.parse(jsonStr);

  // Normalize sections
  const sections: ReviewSection[] = Array.isArray(parsed.sections)
    ? parsed.sections.map((s: Record<string, unknown>, i: number) => ({
        title: String(s.title || `Section ${i + 1}`),
        content: String(s.content || ""),
        order: typeof s.order === "number" ? s.order : i,
      }))
    : [];

  // Normalize actions
  const validTypes = new Set([
    "kill", "automate", "focus", "unblock", "experiment", "general",
  ]);
  const validPriorities = new Set(["high", "medium", "low"]);

  const actions: ActionItem[] = Array.isArray(parsed.actions)
    ? parsed.actions
        .filter((a: Record<string, unknown>) => a.text && typeof a.text === "string")
        .map((a: Record<string, unknown>) => ({
          text: String(a.text),
          type: validTypes.has(String(a.type)) ? String(a.type) as ActionItem["type"] : "general",
          priority: validPriorities.has(String(a.priority)) ? String(a.priority) as ActionItem["priority"] : "medium",
        }))
    : [];

  // Normalize metrics
  const rawMetrics = parsed.metrics && typeof parsed.metrics === "object" ? parsed.metrics : {};
  const metrics: ReviewMetrics = {
    tasksCompleted: Number(rawMetrics.tasksCompleted) || 0,
    tasksTotal: Number(rawMetrics.tasksTotal) || 0,
    completionRate: Number(rawMetrics.completionRate) || 0,
    routineAdherence: Number(rawMetrics.routineAdherence) || 0,
    moodAverage: rawMetrics.moodAverage != null ? Number(rawMetrics.moodAverage) : undefined,
    energyAverage: rawMetrics.energyAverage != null ? Number(rawMetrics.energyAverage) : undefined,
    sleepAverage: rawMetrics.sleepAverage != null ? Number(rawMetrics.sleepAverage) : undefined,
    totalSpent: rawMetrics.totalSpent != null ? Number(rawMetrics.totalSpent) : undefined,
    attendanceRate: rawMetrics.attendanceRate != null ? Number(rawMetrics.attendanceRate) : undefined,
    deepWorkHours: rawMetrics.deepWorkHours != null ? Number(rawMetrics.deepWorkHours) : undefined,
    notesCreated: rawMetrics.notesCreated != null ? Number(rawMetrics.notesCreated) : undefined,
    projectsProgress: Array.isArray(rawMetrics.projectsProgress)
      ? rawMetrics.projectsProgress.map((p: Record<string, unknown>) => ({
          name: String(p.name || ""),
          progress: Number(p.progress) || 0,
        }))
      : undefined,
    identityStrength: Array.isArray(rawMetrics.identityStrength)
      ? rawMetrics.identityStrength.map((i: Record<string, unknown>) => ({
          name: String(i.name || ""),
          score: Number(i.score) || 0,
        }))
      : undefined,
    weeklyTrends: Array.isArray(rawMetrics.weeklyTrends)
      ? rawMetrics.weeklyTrends.map((t: Record<string, unknown>) => ({
          label: String(t.label || ""),
          values: Array.isArray(t.values) ? t.values.map(Number) : [],
        }))
      : undefined,
  };

  return {
    summary: String(parsed.summary || "").slice(0, 2000),
    sections,
    actions,
    metrics,
  };
}

// ─── Main generator ────────────────────────────────────────
export async function generateReview(
  userId: string,
  type: ReviewType,
  date: Date,
  options?: { replaceExisting?: boolean }
): Promise<{
  id: string;
  type: ReviewType;
  periodStart: Date;
  periodEnd: Date;
  summary: string;
}> {
  const config = getReviewPrompt(type);
  const { periodStart, periodEnd } = getPeriodBounds(type, date);

  // Dedup: check if a review already exists for this period
  const existing = await prisma.review.findFirst({
    where: {
      userId,
      type,
      periodStart,
      periodEnd,
    },
  });

  // If replaceExisting, delete the old one; otherwise return existing
  if (existing) {
    if (options?.replaceExisting) {
      await prisma.review.delete({ where: { id: existing.id } });
    } else {
      return {
        id: existing.id,
        type: existing.type,
        periodStart: existing.periodStart,
        periodEnd: existing.periodEnd,
        summary: existing.summary,
      };
    }
  }

  // 1. Fetch data
  const data = await fetchReviewData(userId, type, date);
  const dataSummary = formatReviewDataSummary(data, type);

  // 2. Build prompts
  const dateStr = format(date, "EEEE, MMMM d, yyyy");
  const messages = [
    { role: "system" as const, content: config.systemPrompt },
    { role: "user" as const, content: config.userPromptBuilder(dataSummary, dateStr) },
  ];

  // 3. Call AI
  const result = await askAI(messages, `review-generation-${type}`, {
    temperature: config.temperature,
    maxTokens: config.maxTokens,
  });

  // 4. Parse response
  let parsed: ParsedReview;
  if (result.ok) {
    try {
      parsed = parseAIResponse(result.data);
    } catch (err) {
      console.error(`Failed to parse ${type} review JSON:`, err);
      parsed = createFallbackReview(type, data.periodStart, data.periodEnd);
    }
  } else {
    console.error(`AI generation failed for ${type} review:`, result.error);
    parsed = createFallbackReview(type, data.periodStart, data.periodEnd);
  }

  // 5. Persist
  const review = await prisma.review.create({
    data: {
      userId,
      type,
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
      status: "generated",
      summary: parsed.summary,
      sections: parsed.sections as unknown as Prisma.InputJsonValue,
      actions: parsed.actions as unknown as Prisma.InputJsonValue,
      metrics: parsed.metrics as unknown as Prisma.InputJsonValue,
    },
  });

  return {
    id: review.id,
    type: review.type,
    periodStart: review.periodStart,
    periodEnd: review.periodEnd,
    summary: review.summary,
  };
}
