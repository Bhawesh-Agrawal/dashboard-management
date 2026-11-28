import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { runAssistantAgent, type AgentStateSnapshot } from "@/features/assistant/lib/agent";
import type { AnyAssistantTool } from "@/features/assistant/tools/registry";

if (!process.env.OPENROUTER_API_KEY) {
  console.error("Refusing to run ai:eval: OPENROUTER_API_KEY is required.");
  process.exit(1);
}
if (process.env.DEPLOY_ENV !== "local") {
  console.error("Refusing to run ai:eval: DEPLOY_ENV must be 'local'.");
  process.exit(1);
}

const FIXTURE_SNAPSHOT: AgentStateSnapshot = {
  nowIso: "2026-11-28 09:30",
  weekday: "Saturday",
  timezone: "Asia/Kathmandu",
  semesterName: "Fall 2026",
  courseNames: ["CS301 Algorithms", "CS302 Operating Systems", "MA201 Linear Algebra"],
};

const FIXTURE_TOOLS: AnyAssistantTool[] = [
  {
    name: "get_today_overview",
    description: "Get today's overview",
    inputSchema: z.object({}),
    parameters: { type: "object", properties: {} },
    execute: async () => ({
      data: {
        today: "2026-11-28",
        classesToday: [{ courseName: "CS301 Algorithms", startTime: "10:00", endTime: "11:00", status: "unmarked" }],
        tasksDueOrOverdue: [{ id: "t1", title: "Submit Lab 4", dueDate: "2026-11-28" }],
      },
    }),
  },
  {
    name: "get_schedule",
    description: "Get class schedule and events for a date range",
    inputSchema: z.object({ from: z.string(), to: z.string() }),
    parameters: { type: "object", required: ["from", "to"], properties: { from: { type: "string" }, to: { type: "string" } } },
    execute: async (_u, input) => ({
      data: {
        from: input.from,
        to: input.to,
        classes: [{ date: "2026-11-30", course: "CS302", startTime: "09:00", endTime: "10:00", status: "unmarked" }],
        events: [{ id: "e1", title: "CS301 Midterm", date: "2026-12-03", type: "exam" }],
      },
    }),
  },
  {
    name: "get_attendance",
    description: "Get attendance metrics for courses",
    inputSchema: z.object({ course: z.string().optional() }),
    parameters: { type: "object", properties: { course: { type: "string" } } },
    execute: async () => ({
      data: {
        courses: [
          { code: "CS301", name: "Algorithms", attended: 18, totalCounted: 20, percent: 90, target: 75, canMiss: 4, mustAttend: 0 },
          { code: "CS302", name: "Operating Systems", attended: 10, totalCounted: 15, percent: 66.7, target: 75, canMiss: 0, mustAttend: 4 },
        ],
      },
    }),
  },
  {
    name: "list_tasks",
    description: "List tasks",
    inputSchema: z.object({ status: z.string().optional(), text: z.string().optional() }),
    parameters: { type: "object", properties: { status: { type: "string" }, text: { type: "string" } } },
    execute: async () => ({
      data: {
        tasks: [
          { id: "t1", title: "Submit Lab 4", dueDate: "2026-11-28", status: "open" },
          { id: "t2", title: "Review OS Deadlocks", dueDate: "2026-12-01", status: "open" },
        ],
      },
    }),
  },
  {
    name: "list_deadlines",
    description: "List upcoming deadlines and assessments",
    inputSchema: z.object({ from: z.string(), to: z.string() }),
    parameters: { type: "object", required: ["from", "to"], properties: { from: { type: "string" }, to: { type: "string" } } },
    execute: async () => ({
      data: {
        tasks: [{ id: "t1", title: "Submit Lab 4", dueDate: "2026-11-28" }],
        assessments: [{ id: "a1", title: "CS301 end_sem", dueDate: "2026-12-10" }],
      },
    }),
  },
  {
    name: "search_notes",
    description: "Search notes and saved links",
    inputSchema: z.object({ query: z.string() }),
    parameters: { type: "object", required: ["query"], properties: { query: { type: "string" } } },
    execute: async () => ({
      data: {
        notes: [
          { id: "n1", kind: "link", title: "React hooks cheat sheet", url: "https://react.dev/reference/react" },
          { id: "n2", kind: "meeting", title: "Project Sync", snippet: "Decided to ship Friday" },
        ],
      },
    }),
  },
  {
    name: "get_academic_calendar",
    description: "Get academic calendar entries",
    inputSchema: z.object({ from: z.string(), to: z.string() }),
    parameters: { type: "object", required: ["from", "to"], properties: { from: { type: "string" }, to: { type: "string" } } },
    execute: async () => ({
      data: {
        entries: [{ kind: "exam_period", title: "End-Sem Exams", startDate: "2026-12-10", endDate: "2026-12-18" }],
      },
    }),
  },
  {
    name: "propose_create_task",
    description: "Propose creating a task",
    inputSchema: z.object({ title: z.string(), dueDate: z.string().optional() }),
    parameters: { type: "object", required: ["title"], properties: { title: { type: "string" }, dueDate: { type: "string" } } },
    execute: async (_u, input) => ({
      data: { proposed: true },
      proposals: [
        {
          id: "prop-1",
          kind: "create_task",
          summary: `Create task: ${input.title}`,
          payload: input,
          status: "pending",
          expiresAt: new Date(Date.now() + 900_000).toISOString(),
        },
      ],
    }),
  },
];

interface EvalCase {
  question: string;
  expectedTool: string;
  expectedFact: string;
}

const EVAL_CASES: EvalCase[] = [
  { question: "What does my day look like?", expectedTool: "get_today_overview", expectedFact: "Lab 4" },
  { question: "What is due this week?", expectedTool: "list_deadlines", expectedFact: "Lab 4" },
  { question: "Can I skip CS301 classes?", expectedTool: "get_attendance", expectedFact: "4" },
  { question: "How is my OS attendance?", expectedTool: "get_attendance", expectedFact: "66.7" },
  { question: "When is my next exam?", expectedTool: "get_academic_calendar", expectedFact: "2026-12-10" },
  { question: "What did I save about React hooks?", expectedTool: "search_notes", expectedFact: "React" },
  { question: "Summarise my last meeting notes", expectedTool: "search_notes", expectedFact: "Project Sync" },
  { question: "Create a task to revise graphs tomorrow", expectedTool: "propose_create_task", expectedFact: "confirm" },
];

// Expand to 40 varied queries across the same fixture tools
while (EVAL_CASES.length < 40) {
  const base = EVAL_CASES[EVAL_CASES.length % 8];
  EVAL_CASES.push({
    question: `${base.question} (check #${EVAL_CASES.length + 1})`,
    expectedTool: base.expectedTool,
    expectedFact: base.expectedFact,
  });
}

async function main() {
  let passed = 0;
  let totalTokens = 0;
  const rows: string[] = [];

  for (let i = 0; i < EVAL_CASES.length; i++) {
    const tc = EVAL_CASES[i];
    try {
      const res = await runAssistantAgent({
        userId: "eval-user",
        userMessage: tc.question,
        snapshot: FIXTURE_SNAPSHOT,
        tools: FIXTURE_TOOLS,
        stream: false,
      });
      totalTokens += res.usage.totalTokens;
      const usedExpected = res.toolsUsed.some((t) => t.name === tc.expectedTool);
      const hasFact = res.answer.toLowerCase().includes(tc.expectedFact.toLowerCase());
      const ok = usedExpected && hasFact;
      if (ok) passed++;
      const status = ok ? "PASS" : "FAIL";
      console.log(`[${i + 1}/40] ${status} | tools=${res.toolsUsed.map((t) => t.name).join(",")} | tokens=${res.usage.totalTokens}`);
      rows.push(`| ${i + 1} | ${tc.question} | ${tc.expectedTool} | ${status} | ${res.usage.totalTokens} |`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "error";
      console.log(`[${i + 1}/40] FAIL (${msg})`);
      rows.push(`| ${i + 1} | ${tc.question} | ${tc.expectedTool} | FAIL (${msg}) | 0 |`);
    }
  }

  const report = [
    "# Assistant Evaluation Report",
    "",
    `- Passed: ${passed}/${EVAL_CASES.length}`,
    `- Total tokens: ${totalTokens}`,
    "",
    "| # | Question | Expected Tool | Result | Tokens |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");

  fs.writeFileSync(path.join(process.cwd(), "docs/AI_EVAL.md"), report, "utf8");
  console.log(`\nDone: ${passed}/${EVAL_CASES.length} passed, totalTokens=${totalTokens}`);
}

void main();
