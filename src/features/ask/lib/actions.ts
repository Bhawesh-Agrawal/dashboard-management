"use server";

import { getCurrentUserId } from "@/lib/auth";
import { askAI, type AIResult } from "@/lib/ai/openrouter";
import {
  searchEntitiesForContext,
  formatGraphContext,
} from "@/features/knowledge-graph/lib/traversal";

export type AskResponse = {
  answer: string;
  contextUsed: boolean;
};

const SYSTEM_PROMPT = `You are an academic assistant for a student's personal command center.
You have access to their courses, tasks, notes, assessments, and attendance data.
Answer questions concisely and accurately based on the provided context.
If you don't have enough information to answer, say so clearly.
Use the context data to provide specific, actionable answers.`;

/**
 * Ask a question about the student's academic data.
 * Uses Knowledge Graph traversal to assemble context, then sends to OpenRouter.
 */
export async function askQuestion(
  question: string
): Promise<AIResult<AskResponse>> {
  await getCurrentUserId();
  // Search for relevant entities based on the question
  const graph = await searchEntitiesForContext(question);

  // Format graph context for the AI
  const contextStr = formatGraphContext(graph);
  const hasContext = graph.nodes.length > 0;

  // Build the prompt with context
  const messages = [
    {
      role: "system" as const,
      content: SYSTEM_PROMPT,
    },
    {
      role: "user" as const,
      content: hasContext
        ? `Context from your academic data:\n\n${contextStr}\n\n---\n\nQuestion: ${question}`
        : `Question: ${question}\n\n(No matching data found in your academic records.)`,
    },
  ];

  const result = await askAI(messages, "ask-question", {
    temperature: 0.3,
    maxTokens: 1024,
  });

  if (!result.ok) {
    return result;
  }

  return {
    ok: true,
    data: {
      answer: result.data,
      contextUsed: hasContext,
    },
  };
}
