# AI Features & Client Audit (Phase 10)

## 1. Shared OpenRouter Client (`src/lib/ai/openrouter.ts`)

- **Current State (Before Phase 10 V2):**
  - Model: `process.env.OPENROUTER_MODEL || "openai/gpt-oss-120b"` (no fast model tier).
  - Headers: hardcoded stale `"HTTP-Referer": "https://academic-command-center.vercel.app"`.
  - Timeout: **None** (`fetch(...)` has no `AbortController` or signal). Callers (`narrateBrief`, `parseCalendarWithAI`, `parseTimetableWithAI`) race a `Promise.race` timer, leaving the underlying HTTP request running until completion/socket timeout.
  - Retries: **None** (429 / 5xx / transient network errors fail immediately).
  - Tool calling / Streaming / Usage: **None** (returns `choice.message.content` string only; drops `usage` token counts; no SSE parser; no `tools` / `tool_calls`).
  - JSON validation: **None** in shared client (each caller strips fences and `JSON.parse`s ad hoc).

## 2. Inventory of Existing AI Call Sites

| Call Site | Prompt Purpose | Model | Token Limits | Output Validation | Timeout Handling | Failure Behaviour | Prompt-Injection Exposure |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `src/features/ask/lib/actions.ts` (`askQuestion`) | One-shot Q&A over Knowledge Graph traversal | Default `OPENROUTER_MODEL` | `maxTokens: 1024`, `temp: 0.3` | None (raw string) | None | Returns `{ ok: false, error }` via `tryAI` | Graph context concatenated directly into user prompt without delimiters or untrusted-data warning |
| `src/features/notes/lib/nlp-parsing.ts` (`parseQuickCapture`) | Classify freeform text into Task or Note JSON | Default `OPENROUTER_MODEL` | `maxTokens: 512`, `temp: 0.1` | Manual `JSON.parse` + ad-hoc field checks (no Zod) | None | Falls back to plain `{ type: "note", content: input }` | User input passed as raw `user` message; mitigated because output only pre-fills UI draft for user confirmation |
| `src/features/semesters/lib/calendar-import.ts` (`parseCalendarWithAI`) | Extract academic calendar entries from pasted text | Default `OPENROUTER_MODEL` | `maxTokens: 1500`, `temp: 0.1`, input capped at `MAX_AI_INPUT_CHARS` | Zod `AiCalendarResponseSchema.safeParse` | `Promise.race` `8000ms` (fetch continues in background) | Returns `{ entries: [], warnings }` | System prompt says ignore instructions; user text not wrapped in explicit data delimiters; output goes to UI review table before DB insert |
| `src/features/schedule/lib/timetable-import.ts` (`parseTimetableWithAI`) | Extract recurring weekly class slots from pasted text | Default `OPENROUTER_MODEL` | `maxTokens: 1800`, `temp: 0.1`, input capped at `MAX_AI_INPUT_CHARS` | Zod `AiTimetableResponseSchema.safeParse` | `Promise.race` `8000ms` (fetch continues in background) | Returns `{ slots: [], badRows: [], warnings }` | System prompt says ignore instructions; user text not wrapped in explicit data delimiters; output goes to UI review table before DB insert |
| `src/features/briefs/lib/narrate.ts` (`narrateBrief`) | Generate 1–2 sentence brief headline + summary from compact JSON | Default `OPENROUTER_MODEL` | `maxTokens: 250`, `temp: 0.2` | Zod `NarrateOutputSchema` + `verifyNoHallucinatedNumbersOrTimes` + `<= 2` sentences | `Promise.race` `8000ms` (fetch continues in background) | Falls back to deterministic `payload.headline` + `payload.summary` | Strong: PII-free compact JSON, truncated titles, system rule to treat JSON strings as untrusted data, numeric/time hallucination guard |
| `src/features/reviews/lib/generator.ts` (`generateReview`) | Synthesize daily/weekly/monthly review JSON from DB summary | Default `OPENROUTER_MODEL` | Per-review `config.maxTokens` | Manual `parseAIResponse` normalization (no Zod schema) | None | `createFallbackReview` with `FALLBACK_MARKER` | Review data summary includes user note/task titles without explicit delimiters or untrusted-data instruction |

## 3. Confirmed Problems in Current `Ask` (`src/features/ask` + `traversal.ts`)

1. **Whole-phrase `contains` retrieval:** `searchEntitiesForContext(question)` passes the entire user question string as a single `contains` substring query across titles/content, returning zero matches for natural questions like `"what is due this week?"` or `"what did I save about react hooks?"`.
2. **No conversation history:** Each question is one-shot; follow-up questions lose all prior context.
3. **No tool calling:** Cannot query schedules, attendance calculations, filtered tasks, deadlines, academic calendar entries, or captures dynamically.
4. **No streaming:** Blocks the UI until the entire completion finishes.
5. **No abort timeout on `chatCompletion`:** `src/lib/ai/openrouter.ts` has no `AbortController`; callers racing a timer leave orphaned requests running.
6. **Stale `HTTP-Referer`:** Hardcoded `https://academic-command-center.vercel.app` instead of `APP_URL`.
7. **System prompt claims attendance data, but only raw record IDs are supplied:** `askQuestion` tells the model it has attendance data, while `formatGraphContext` only passes raw entity IDs/titles without running `calculations.ts` (`attended`, `total`, `percent`, `canMiss`, `mustAttend`).
8. **Missing data domains:** No calendar events, no `AcademicCalendarEntry` (holidays, breaks, exam periods, `follows_weekday`), no Phase 9 captures (`link`, `quote`, `meeting`, `checklist`), no DSA summary, and no Brief v2 data.
