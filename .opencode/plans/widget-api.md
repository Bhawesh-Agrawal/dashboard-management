# Widget API Implementation Plan

## Overview

Adds authenticated REST endpoints (`/api/widget/*`) for Tasker/KWGT on Android. Part A of the spec — backend only. Part B (Tasker/KWGT setup) is manual on-device.

---

## Step 1: Add `WidgetToken` Prisma Model

**File:** `prisma/schema.prisma` (add at end)

```prisma
model WidgetToken {
  id           String    @id @default(uuid())
  tokenHash    String    @map("token_hash")
  createdAt    DateTime  @default(now()) @map("created_at")
  lastUsedAt   DateTime? @map("last_used_at")
  revokedAt    DateTime? @map("revoked_at")

  @@map("widget_tokens")
}
```

- Single-user app — enforce one active token at a time
- SHA-256 hash stored, raw token shown once at generation
- `lastUsedAt` updated on each successful API call
- `revokedAt` set when revoked; must revoke before generating new

---

## Step 2: Create Widget Auth Library

**New file:** `src/features/widget/lib/auth.ts`

Exports:
- `generateWidgetToken()` — creates raw token + SHA-256 hash, revokes any prior active token, returns raw token once
- `verifyWidgetToken(token)` — hashes input, looks up in DB, checks revokedAt, updates lastUsedAt
- `getActiveWidgetTokenInfo()` — returns `{ exists, lastUsedAt }` for Settings UI
- `revokeWidgetToken()` — sets revokedAt on all active tokens

Uses Node.js built-in `crypto` module (`crypto.randomBytes`, `crypto.createHash`).

---

## Step 3: Create Widget Auth Middleware

**New file:** `src/features/widget/lib/middleware.ts`

Exports `requireWidgetAuth(request)` → returns `{ ok: boolean, response?: NextResponse }`. Checks `Authorization: Bearer <token>` header, calls `verifyWidgetToken`, returns 401 JSON on failure.

---

## Step 4: Update Proxy to Allow `/api/widget`

**File:** `src/app/proxy.ts`

Add `!request.nextUrl.pathname.startsWith("/api/widget")` to the auth bypass condition (alongside existing `/login`, `/signup`, `/auth` exclusions). Widget routes bypass Supabase cookie auth — protected by Bearer token instead.

---

## Step 5: Create Widget Server Actions (for Settings UI)

**New file:** `src/features/widget/lib/actions.ts`

Server Actions:
- `generateWidgetTokenAction()` — calls `generateWidgetToken()`, revalidates `/settings`, returns `{ token, error? }`
- `revokeWidgetTokenAction()` — calls `revokeWidgetToken()`, revalidates `/settings`
- `getWidgetTokenStatus()` — returns `{ exists, lastUsedAt }`

---

## Step 6: Create Widget Settings Component

**New file:** `src/features/settings/components/widget-access-settings.tsx`

Follows the pattern of `AIProviderSettings` (bordered card, icon, status, action buttons):
- Status: "Active — last used {timestamp}" or "No active token"
- "Generate Token" button → shows raw token once with copy button + "you won't see this again" warning
- "Revoke" button (visible when token exists) → confirmation dialog
- Same styling as existing integration cards

---

## Step 7: Register Widget Settings on Settings Page

**File:** `src/app/(app)/settings/page.tsx`

Import `WidgetAccessSettings`, render inside Integrations section after `GoogleCalendarSettings`.

---

## Step 8: Create `GET /api/widget/summary`

**New file:** `src/app/api/widget/summary/route.ts`

Compact JSON response:
- `topTasks` — exactly 3 slots (null for empty), same starred-task query as dashboard
- `routines` — today's routines capped at 5, includes `done` status (same pattern as `getRoutinesWithStreaks` but lighter)
- `upcomingEvents` — merged non-birthday + birthday events, capped at 3, 7-day window
- `streakCount` — reuses `computeActivityStreak()` from `streaks.ts` (cached 60s, not forked)

---

## Step 9: Create `POST /api/widget/tasks/[id]/toggle`

**New file:** `src/app/api/widget/tasks/[id]/toggle/route.ts`

- Same Prisma logic as `toggleTaskDone()` in `tasks/lib/actions.ts`
- Toggles status open↔done, sets/clears completedAt
- Returns `{ id, done }` — the new done state
- Calls `revalidatePath` for `/tasks` and `/today` to keep in-app UI in sync

---

## Step 10: Create `POST /api/widget/routines/[id]/complete`

**New file:** `src/app/api/widget/routines/[id]/complete/route.ts`

- Upserts today's `RoutineCompletion` (idempotent — already completed = no-op)
- Same pattern as `completeRoutine()` in `routines/lib/completions.ts`
- Returns `{ id, done: true }`

---

## Step 11: Create `POST /api/widget/quick-add`

**New file:** `src/app/api/widget/quick-add/route.ts`

- Accepts `{ "text": "..." }`
- Calls existing `parseQuickCapture()` from `notes/lib/nlp-parsing.ts` with `getActiveCourses()`
- If type=task: creates Task via Prisma, returns `{ id, title, type }`
- If type=note: creates Note via Prisma, returns `{ id, title, type }`
- No new parser — reuses existing NLP path with its graceful fallback

---

## Step 12: Run Prisma Migration

```bash
npx prisma migrate dev --name add-widget-token
```

---

## Step 13: Verify with curl

Test all endpoints with a real generated token. Confirm:
- Summary returns correct structure
- Toggle updates task in DB (verify on `/tasks` page)
- Complete creates RoutineCompletion
- Quick-add creates task/note
- Revoked token → 401 on all endpoints

---

## Files Changed / Created

| Action | File |
|---|---|
| Edit | `prisma/schema.prisma` |
| Edit | `src/app/proxy.ts` |
| Edit | `src/app/(app)/settings/page.tsx` |
| Create | `src/features/widget/lib/auth.ts` |
| Create | `src/features/widget/lib/middleware.ts` |
| Create | `src/features/widget/lib/actions.ts` |
| Create | `src/features/settings/components/widget-access-settings.tsx` |
| Create | `src/app/api/widget/summary/route.ts` |
| Create | `src/app/api/widget/tasks/[id]/toggle/route.ts` |
| Create | `src/app/api/widget/routines/[id]/complete/route.ts` |
| Create | `src/app/api/widget/quick-add/route.ts` |

## Key Design Decisions

1. **No forked logic** — reuses `computeActivityStreak()`, `parseQuickCapture()`, same Prisma queries as dashboard
2. **Token hashing** — SHA-256 via Node.js crypto, raw token shown once
3. **Proxy bypass** — widget routes excluded from Supabase auth, protected by Bearer token
4. **Fixed slots** — topTasks=3 (null-filled), routines≤5, events≤3 for Tasker/KWGT binding
5. **Settings UI** — follows existing integration card pattern (AIProviderSettings, GoogleCalendarSettings)
