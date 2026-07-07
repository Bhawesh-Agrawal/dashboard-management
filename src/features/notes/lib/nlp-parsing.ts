/**
 * NLP parsing for Quick Capture.
 *
 * Parses freeform text into structured Task or Note data using OpenRouter.
 * Falls back to saving as a plain note on AI failure.
 */

import { askAI } from "@/lib/ai/openrouter";
import { prisma } from "@/lib/prisma";

export type ParsedCapture = {
  type: "task" | "note";
  title: string | null;
  content: string;
  dueDate: string | null;
  courseName: string | null;
  courseId: string | null;
  tags: string[];
};

const PARSE_PROMPT = `You are a parsing assistant for a student's academic app.
Parse the user's input into a structured task or note.

Return ONLY valid JSON (no markdown, no explanation):
{
  "type": "task" or "note",
  "title": "short descriptive title" or null,
  "content": "the full original input text",
  "dueDate": "YYYY-MM-DDTHH:MM:SS" or "YYYY-MM-DD" or null,
  "courseName": "likely course name" or null,
  "tags": ["relevant", "tags"]
}

Rules:
- If the input mentions a deadline, due date, or time-bound action → type: "task"
- If the input is a note, reminder, or thought → type: "note"
- Extract the most likely course name from context (e.g. "physics" → "Physics", "data structures" → "Data Structures")
- If no course is mentioned, courseName: null
- Tags should be lowercase, relevant to content
- Title should be concise (5-8 words max)
- For due dates with times, use ISO format: "2026-07-11T17:00:00"
- For due dates without a specific time, use: "2026-07-11"
- Interpret relative dates: "tomorrow" = next day, "friday" = next Friday, "next week" = 7 days from now
- Interpret times: "5pm" = 17:00, "9:30am" = 09:30, "noon" = 12:00`;

/**
 * Parse freeform text into structured Task or Note data.
 * Returns the parsed result or falls back to a plain note on failure.
 */
export async function parseQuickCapture(
  input: string,
  availableCourses: { id: string; name: string; code: string | null }[]
): Promise<ParsedCapture> {
  // Build context with available courses
  const courseList = availableCourses
    .map((c) => `- ${c.name}${c.code ? ` (${c.code})` : ""} [id: ${c.id}]`)
    .join("\n");

  const systemPrompt = `${PARSE_PROMPT}\n\nAvailable courses in the active semester:\n${courseList || "(none)"}`;

  const result = await askAI(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: input },
    ],
    "quick-capture-parsing",
    { temperature: 0.1, maxTokens: 512 }
  );

  // On failure, fall back to plain note
  if (!result.ok) {
    return {
      type: "note",
      title: null,
      content: input,
      dueDate: null,
      courseName: null,
      courseId: null,
      tags: [],
    };
  }

  // Try to parse the AI response
  try {
    // Extract JSON from the response (handle markdown code blocks)
    let jsonStr = result.data.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const parsed = JSON.parse(jsonStr) as {
      type?: string;
      title?: string | null;
      content?: string;
      dueDate?: string | null;
      courseName?: string | null;
      tags?: string[];
    };

    // Match course name to an existing course
    let courseId: string | null = null;
    let matchedCourseName: string | null = null;

    if (parsed.courseName) {
      const searchName = parsed.courseName.toLowerCase();
      const match = availableCourses.find(
        (c) =>
          c.name.toLowerCase().includes(searchName) ||
          searchName.includes(c.name.toLowerCase()) ||
          (c.code && c.code.toLowerCase() === searchName)
      );
      if (match) {
        courseId = match.id;
        matchedCourseName = match.name;
      } else {
        matchedCourseName = parsed.courseName;
      }
    }

    // Validate due date format (supports both date and datetime)
    let dueDate: string | null = null;
    if (parsed.dueDate) {
      const dateOnlyRegex = /^\d{4}-\d{2}-\d{2}$/;
      const datetimeRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;
      if (datetimeRegex.test(parsed.dueDate) || dateOnlyRegex.test(parsed.dueDate)) {
        dueDate = parsed.dueDate;
      }
    }

    return {
      type: parsed.type === "task" ? "task" : "note",
      title: parsed.title || null,
      content: parsed.content || input,
      dueDate,
      courseName: matchedCourseName,
      courseId,
      tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 5) : [],
    };
  } catch {
    // JSON parsing failed — fall back to plain note
    return {
      type: "note",
      title: null,
      content: input,
      dueDate: null,
      courseName: null,
      courseId: null,
      tags: [],
    };
  }
}

/**
 * Get available courses for the active semester.
 * Used to provide context to the NLP parser.
 */
export async function getActiveCourses(): Promise<
  { id: string; name: string; code: string | null }[]
> {
  const activeSemester = await prisma.semester.findFirst({
    where: { isActive: true },
  });

  if (!activeSemester) return [];

  return prisma.course.findMany({
    where: { semesterId: activeSemester.id },
    select: { id: true, name: true, code: true },
  });
}
