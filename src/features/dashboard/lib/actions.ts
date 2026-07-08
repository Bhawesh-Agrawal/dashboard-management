"use server";

import { askAI, type AIResult } from "@/lib/ai/openrouter";
import { getDashboardData } from "@/features/dashboard/lib/queries";
import fs from "fs/promises";
import path from "path";
import os from "os";

export type InsightsResponse = {
  insights: string[];
  refreshedAt: string;
};

const SYSTEM_PROMPT = `You are a highly intelligent academic productivity assistant.
You will be provided with the user's CURRENT dashboard data in JSON format (active tasks, active projects, upcoming deadlines, attendance alerts for the CURRENT semester).
Analyze the data and provide exactly 2 to 3 highly insightful, actionable, and encouraging insights.

Focus on:
1. Urgent priorities (e.g., tasks or deadlines due in the next 48 hours).
2. Actionable advice on managing the current workload (e.g., breaking down a large active project).
3. Attendance or routine warnings ONLY IF they appear in the provided current data.

CRITICAL RULES:
- DO NOT invent or assume data that is not provided.
- DO NOT mention past semesters or inactive courses.
- Keep each insight to 1-2 short sentences. Be encouraging, but direct.
- Return ONLY a valid JSON array of strings, with no markdown formatting, no backticks, and no explanation.`;

const CACHE_FILE = path.join(os.tmpdir(), "academic-dashboard-insights.json");

// In-memory fallback
const globalCache = globalThis as unknown as { __insightsCache?: InsightsResponse };

export async function getCachedInsights(): Promise<InsightsResponse | null> {
  if (globalCache.__insightsCache) {
    return globalCache.__insightsCache;
  }
  try {
    const data = await fs.readFile(CACHE_FILE, "utf-8");
    const parsed = JSON.parse(data) as InsightsResponse;
    globalCache.__insightsCache = parsed;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Generate AI insights from the student's academic data.
 * Uses the shared Knowledge Graph traversal to assemble context,
 * ensuring consistent context between Ask, AI Insights, and any future features.
 */
export async function refreshInsights(): Promise<AIResult<InsightsResponse>> {
  // Use the active dashboard data to ensure we only look at the current semester
  // and currently relevant tasks/routines.
  const dashboardData = await getDashboardData();
  
  // Minimize data to prevent token limits and truncation
  const minimalData = {
    topTasks: dashboardData.topTasks.map(t => ({ title: t.title, due: t.dueDate })),
    classes: dashboardData.todayClasses.map(c => ({ name: c.course.name, time: c.startTime })),
    deadlines: dashboardData.upcomingDeadlines.map(d => ({ title: d.title, date: d.date, type: d.type })),
    alerts: dashboardData.attendanceAlerts.map(a => ({ course: a.courseName, percent: a.attendancePercent })),
  };
  
  const contextStr = JSON.stringify(minimalData, null, 2);

  const result = await askAI(
    [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Here is the student's current academic data:\n\n${contextStr}\n\nGenerate 2-3 insights.`,
      },
    ],
    "dashboard-insights",
    { temperature: 0.4, maxTokens: 1024 }
  );

  if (!result.ok) {
    return result;
  }

  // Parse the response — expect a JSON array of strings
  let insights: string[];
  try {
    // Try to extract JSON array from the response (may be wrapped in markdown)
    const text = result.data;
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      insights = JSON.parse(jsonMatch[0]);
    } else {
      // Fallback: split by newlines and filter
      insights = text.split("\n").filter((line) => line.trim().length > 0).slice(0, 3);
    }
  } catch {
    // If parsing fails, treat the whole response as a single insight
    insights = [result.data.slice(0, 200)];
  }

  const responseData = {
    insights,
    refreshedAt: new Date().toISOString(),
  };

  // Save to memory immediately for instant reloads
  globalCache.__insightsCache = responseData;

  try {
    await fs.writeFile(CACHE_FILE, JSON.stringify(responseData, null, 2));
  } catch (err) {
    console.error("Failed to save insights cache:", err);
  }

  return {
    ok: true,
    data: responseData,
  };
}
