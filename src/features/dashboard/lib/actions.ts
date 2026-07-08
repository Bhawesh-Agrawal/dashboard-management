"use server";

import { askAI, type AIResult } from "@/lib/ai/openrouter";
import { searchEntitiesForContext, formatGraphContext } from "@/features/knowledge-graph/lib/traversal";
import fs from "fs/promises";
import path from "path";

export type InsightsResponse = {
  insights: string[];
  refreshedAt: string;
};

const SYSTEM_PROMPT = `You are an academic assistant for a student's personal command center.
Analyze the student's data and surface 2-3 things worth attention.
Focus on: upcoming deadlines with no preparation, courses where attendance is slipping,
notes not reviewed recently, tasks close to their due date with no progress, patterns worth noting.
Be specific, actionable, and concise. Each insight should be one or two sentences.
Return ONLY a JSON array of strings, no markdown, no explanation.`;

const CACHE_FILE = path.join(process.cwd(), ".insights.json");

export async function getCachedInsights(): Promise<InsightsResponse | null> {
  try {
    const data = await fs.readFile(CACHE_FILE, "utf-8");
    return JSON.parse(data) as InsightsResponse;
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
  // Use the shared Knowledge Graph search to build context
  // Empty query + global context gives us a broad view of the student's data
  const graph = await searchEntitiesForContext("");
  const contextStr = formatGraphContext(graph);

  const result = await askAI(
    [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Here is the student's current academic data:\n\n${contextStr}\n\nGenerate 2-3 insights.`,
      },
    ],
    "dashboard-insights",
    { temperature: 0.4, maxTokens: 512 }
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
