# CodexDash AI Assistant Architecture

## 1. Overview

`/ask` is a bounded, tool-using assistant over the owner's own workspace data:
- **OpenRouter Client V2** ([src/lib/ai/openrouter.ts](file:///home/bhawesh/Projects/dashboard-management/src/lib/ai/openrouter.ts)): `AbortController` timeouts (default 30s), exponential backoff + jitter retries (429/5xx/network, honouring `Retry-After`), OpenAI-style `tools`, SSE streaming (`streamChatCompletion`), Zod JSON helper with one repair retry (`chatCompletionJson`), and structured token usage logging.
- **Agent Loop** ([src/features/assistant/lib/agent.ts](file:///home/bhawesh/Projects/dashboard-management/src/features/assistant/lib/agent.ts)): up to 6 tool rounds, parallel tool calls, 5s per-tool timeout, 45s overall budget, last 12 conversation turns truncated to budget, max 5 proposals per turn, and separate source derivation.
- **Streaming & Persistence** ([/api/assistant/stream](file:///home/bhawesh/Projects/dashboard-management/src/app/api/assistant/stream/route.ts), [persistence.ts](file:///home/bhawesh/Projects/dashboard-management/src/features/assistant/lib/persistence.ts)): `AiConversation` + `AiMessage` tables, latest 50 conversations retained, older conversations purged in `/api/cron/daily-diagnostics`.

## 2. Registered Tools

### Read Tools
- `get_today_overview`: today's classes, events, tasks, assessments, and academic calendar in the user's timezone.
- `get_schedule`: class occurrences (`occurrences.ts` + `AcademicCalendarEntry`) and events for `from..to`.
- `get_attendance`: attended, counted, percent, target, `canMiss`, `mustAttend`, and unmarked past classes via `calculations.ts`.
- `get_courses`: active semester courses, credits, target grades, and assessments.
- `get_academic_calendar`: holidays, breaks, exam periods, `follows_weekday`, and notes.
- `list_tasks`: filtered by status, due range, course, project, or text.
- `list_deadlines`: tasks and assessments in a date range.
- `search_notes`: tokenized keyword search over title, content, URL, and tags.
- `get_note`: full note content (capped at 4000 chars) + meeting/link metadata.
- `list_projects`, `get_project`: project status, milestones, and open tasks.
- `get_latest_brief`: latest morning/midday/evening brief summary.
- `get_dsa_summary`: read-only DSA summary, registered **only** when `assistantDsaAccess` is enabled in Settings.

### Write Proposal Tools (Never Execute Directly)
- `propose_create_task`
- `propose_update_task` (complete or reschedule)
- `propose_create_event`
- `propose_save_note` (`note`, `link`, `quote`, `checklist`)

Proposals expire after 15 minutes, are capped at 5 per turn, and execute only when confirmed in the UI via existing server actions (`/api/assistant/proposals/[id]/confirm`).

## 3. Safety & Cost Controls

- **Ownership:** Every tool authenticates/scopes by `userId` / `ownerWhere(userId)`.
- **Prompt Injection:** Tool outputs are wrapped in `<tool_result name="...">...</tool_result>` delimiters and treated as untrusted data. Write tools only create proposals.
- **Rate Limits & Caps:** 20 requests per 10 minutes and daily token cap (default `200,000`), computed from `AiMessage` rows in Postgres (no in-memory state, safe across Cloud Run instances).
- **Privacy:** Logs record only tool names, durations, token counts, and error codes — never secrets, user prompts, or note contents.

## 4. How to Add a New Tool

1. Define a Zod `inputSchema`, OpenAI JSON `parameters`, and `execute(userId, input)` in `src/features/assistant/tools/`.
2. Scope all Prisma queries by `userId` / `ownerWhere(userId)` and keep outputs compact (`capToolResult`).
3. Register the tool in `getRegisteredTools` in [registry.ts](file:///home/bhawesh/Projects/dashboard-management/src/features/assistant/tools/registry.ts).
4. Add unit tests for shape, ownership, and edge cases.
