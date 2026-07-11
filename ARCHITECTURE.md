# Academic Command Center — Architecture Documentation

> A personal academic productivity dashboard for students — managing courses, attendance, grades, tasks, notes, routines, budgets, projects, and more. Built as a Progressive Web App (PWA) with offline support and push notifications.

---

## Table of Contents

- [1. Tech Stack](#1-tech-stack)
- [2. Architecture Patterns](#2-architecture-patterns)
- [3. Directory Structure](#3-directory-structure)
- [4. Database](#4-database)
- [5. Authentication](#5-authentication)
- [6. Styling System](#6-styling-system)
- [7. Feature Modules](#7-feature-modules)
- [8. AI Integration](#8-ai-integration)
- [9. API Routes](#9-api-routes)
- [10. Server Actions](#10-server-actions)
- [11. PWA Features](#11-pwa-features)
- [12. Push Notifications](#12-push-notifications)
- [13. External Integrations](#13-external-integrations)
- [14. State Management](#14-state-management)
- [15. Testing](#15-testing)
- [16. Deployment](#16-deployment)
- [17. Key Libraries](#17-key-libraries)
- [18. Custom CSS Design System](#18-custom-css-design-system)
- [19. Type System](#19-type-system)
- [20. Configuration Files](#20-configuration-files)

---

## 1. Tech Stack

| Category | Technology | Version |
|----------|-----------|---------|
| Framework | Next.js (App Router) | 16.2.10 |
| Language | TypeScript | ^5 |
| React | React + React DOM | 19.2.4 |
| Database | PostgreSQL (via Supabase) | — |
| ORM | Prisma | ^7.8.0 |
| Auth | Supabase Auth | `@supabase/ssr` ^0.12.0, `@supabase/supabase-js` ^2.110.0 |
| Styling | Tailwind CSS | v4 (`@tailwindcss/postcss`) |
| UI Components | shadcn/ui | ^4.13.0 (base-nova style) |
| Animations | Framer Motion | ^12.42.2 |
| Icons | Lucide React | ^1.23.0 |
| Date Handling | date-fns | ^4.4.0 |
| AI | OpenRouter API | `openai/gpt-oss-120b` |
| OCR | Tesseract.js | ^7.0.0 |
| Google APIs | googleapis | ^173.0.0 |
| Push Notifications | web-push | ^3.6.7 (VAPID) |
| Date Picker | react-day-picker | ^10.0.1 |
| Toasts | Sonner | ^2.0.7 |
| Testing | Vitest | ^4.1.10 |
| Linting | ESLint | ^9 (core-web-vitals + TypeScript) |
| Deployment | Vercel | — |
| Package Manager | npm | — |
| Fonts | Geist Sans/Mono + Playfair Display | Via `next/font/google` |

---

## 2. Architecture Patterns

### Feature-Based Monolith
Single Next.js application organized using a **feature-based directory structure**. Each feature module (`src/features/*`) encapsulates its own server logic, components, and types.

### Server-First Architecture
- **Server Components by default** — Pages are async server components that fetch data directly via Prisma
- **Server Actions** — All mutations use `"use server"` functions
- **No client state management library** — No Redux, Zustand, Jotai, or React Context
- **URL Search Params** — Filtering state managed via URL (task status, course filter, etc.)

### Key Patterns
1. **Next.js App Router** — Route groups `(app)` and `(auth)`, dynamic routes `[id]`
2. **React `cache()`** — Request-level deduplication for data fetching
3. **In-Memory Caching** — Custom `MemCache` singleton with configurable TTL
4. **Knowledge Graph** — On-demand graph traversal from Prisma foreign keys
5. **Graceful AI Degradation** — `tryAI()` wrapper never throws, always returns structured `AIResult<T>`
6. **PWA** — Service Worker, manifest.json, offline support, push notifications
7. **Dynamic Imports** — Heavy components lazy-loaded via `next/dynamic`
8. **Proxy Auth Guard** — Custom proxy function for Supabase session refresh

---

## 3. Directory Structure

```
├── .env                          # Environment variables
├── .env.local                    # Local overrides
├── .gitignore
├── AGENTS.md                     # AI agent rules
├── components.json               # shadcn/ui configuration
├── eslint.config.mjs             # ESLint flat config
├── next.config.ts                # Next.js configuration
├── package.json                  # Dependencies and scripts
├── postcss.config.mjs            # PostCSS config (Tailwind)
├── prisma.config.ts              # Prisma configuration
├── tsconfig.json                 # TypeScript configuration
├── vercel.json                   # Vercel deployment config
├── vitest.config.ts              # Vitest test configuration
│
├── prisma/
│   ├── schema.prisma             # Database schema (24 models)
│   └── migrations/
│       └── 20260706082750_init/  # Initial migration
│
├── public/
│   ├── manifest.json             # PWA manifest
│   ├── sw.js                     # Service Worker
│   ├── offline.html              # Offline fallback page
│   └── icon-*.png                # PWA icons (8 sizes)
│
├── scripts/
│   └── generate-icons.js         # PWA icon generator (Sharp)
│
└── src/
    ├── app/                      # Next.js App Router
    │   ├── layout.tsx            # Root layout (fonts, Toaster)
    │   ├── page.tsx              # Root → redirects to /today
    │   ├── globals.css           # Global styles
    │   ├── proxy.ts              # Auth middleware proxy
    │   ├── (app)/                # Authenticated route group
    │   │   ├── layout.tsx        # App shell
    │   │   ├── loading.tsx       # Loading state
    │   │   ├── today/page.tsx    # Main dashboard
    │   │   ├── tasks/page.tsx
    │   │   ├── calendar/page.tsx
    │   │   ├── semesters/page.tsx
    │   │   ├── semesters/[id]/page.tsx
    │   │   ├── courses/[id]/page.tsx
    │   │   ├── routines/page.tsx
    │   │   ├── notes/page.tsx
    │   │   ├── notes/[id]/page.tsx
    │   │   ├── projects/page.tsx
    │   │   ├── projects/[id]/page.tsx
    │   │   ├── budget/page.tsx
    │   │   ├── library/page.tsx
    │   │   ├── people/page.tsx
    │   │   ├── people/[id]/page.tsx
    │   │   ├── search/page.tsx
    │   │   ├── ask/page.tsx
    │   │   ├── settings/page.tsx
    │   │   └── more/page.tsx
    │   ├── (auth)/               # Unauthenticated route group
    │   │   ├── layout.tsx
    │   │   ├── login/page.tsx
    │   │   └── signup/page.tsx
    │   └── api/                  # API Routes
    │       ├── auth/google/callback/route.ts
    │       ├── cron/insights/route.ts
    │       ├── notifications/trigger/route.ts
    │       └── widget/
    │           ├── summary/route.ts
    │           ├── quick-add/route.ts
    │           ├── tasks/[id]/toggle/route.ts
    │           └── routines/[id]/complete/route.ts
    │
    ├── components/
    │   ├── layout/               # App shell components
    │   ├── shared/               # Cross-feature reusable components
    │   └── ui/                   # shadcn/ui primitives
    │
    ├── features/                 # Feature modules (23 total)
    │   ├── ask/                  # AI Q&A assistant
    │   ├── assessments/          # Grade/assessment tracking
    │   ├── attendance/           # Attendance calendar + marking
    │   ├── auth/                 # Supabase authentication
    │   ├── budget/               # Income/expense tracking
    │   ├── calendar/             # Calendar + Google Calendar sync
    │   ├── courses/              # Course management
    │   ├── dashboard/            # Main dashboard (Today page)
    │   ├── domains/              # Life domains
    │   ├── files/                # File storage (placeholder)
    │   ├── knowledge-graph/      # Entity relationship traversal
    │   ├── library/              # Quotes + saved resources
    │   ├── notes/                # Notes (text, OCR, NLP)
    │   ├── notifications/        # Web Push + scheduler
    │   ├── people/               # Light CRM
    │   ├── projects/             # Non-academic project tracking
    │   ├── routines/             # Habit tracking + streaks
    │   ├── schedule/             # Class schedule grid
    │   ├── search/               # Global search (Cmd+K)
    │   ├── semesters/            # Semester management
    │   ├── settings/             # Settings page logic
    │   ├── tasks/                # Task management
    │   └── widget/               # External widget API (Tasker/KWGT)
    │
    ├── lib/                      # Shared utilities
    │   ├── ai/openrouter.ts      # OpenRouter AI client
    │   ├── constants.ts          # Nav items, colors, defaults
    │   ├── course-utils.ts       # Course end-date check
    │   ├── mem-cache.ts          # In-memory cache with TTL
    │   ├── prisma.ts             # Prisma client singleton
    │   └── utils.ts              # cn() utility
    │
    └── types/
        └── index.ts              # Shared TypeScript types
```

---

## 4. Database

### Provider
PostgreSQL hosted on Supabase (`db.dmzneldbvavsecdezfex.supabase.co`)

### ORM
Prisma ^7.8.0 with `@prisma/adapter-pg` (PostgreSQL driver adapter, library engine type)

### Models (24 total)

| Model | Table | Description |
|-------|-------|-------------|
| `Semester` | `semesters` | Academic terms with grading scale, start/end dates, active flag |
| `Course` | `courses` | Courses within semesters (credits, instructor, color, attendance mode) |
| `ClassSchedule` | `class_schedules` | Weekly recurring time slots for a course |
| `AttendanceRecord` | `attendance_records` | Per-class attendance (present/absent/cancelled/not_marked) |
| `Assessment` | `assessments` | Grading components (minor, mid-sem, end-sem, attendance) |
| `GradingConfig` | `grading_configs` | Marks%-to-grade-point conversion table (per course/semester) |
| `AttendanceMarksConfig` | `attendance_marks_configs` | Attendance%-to-marks table (per course/semester) |
| `Task` | `tasks` | Tasks with priority, status, due date, linked to course/project/domain |
| `Note` | `notes` | Quick notes with tags, source type (typed/ocr_photo/voice) |
| `Event` | `events` | Calendar events (general, birthday, class, assessment) |
| `Quote` | `quotes` | Library quotes with tags |
| `Routine` | `routines` | Daily/weekly habits with time-of-day, active days, streak goal |
| `RoutineCompletion` | `routine_completions` | Daily habit completion records |
| `PushSubscription` | `push_subscriptions` | Web Push subscription endpoints and keys |
| `NotificationPreference` | `notification_preferences` | Per-user notification type toggles + daily summary config |
| `Domain` | `domains` | Life categories (Personal, Finances, etc.) |
| `Project` | `projects` | Non-academic projects with status (active/completed/archived) |
| `Milestone` | `milestones` | Weighted milestones within projects |
| `BudgetEntry` | `budget_entries` | Income/expense tracking |
| `Resource` | `resources` | Saved readings/links for the Library |
| `Person` | `people` | Light CRM (name, birthday, notes) |
| `GoogleCalendarToken` | `google_calendar_tokens` | OAuth tokens for Google Calendar sync |
| `AiInsight` | `ai_insights` | Cached AI-generated insights |
| `WidgetToken` | `widget_tokens` | API tokens for external widgets (Tasker/KWGT) |

### Enums (12 total)
`GradingScale`, `AttendanceMode`, `DayOfWeek`, `AttendanceStatus`, `AssessmentType`, `TaskStatus`, `SourceType`, `EventType`, `TimeOfDay`, `ProjectStatus`, `BudgetType`

### Key Relationships
```
Semester ──1:N──> Course ──1:N──> ClassSchedule
                   │──1:N──> AttendanceRecord
                   │──1:N──> Assessment
                   │──1:N──> Task (optional)
                   │──1:N──> Note (optional)
                   │──1:N──> GradingConfig
                   │──1:N──> AttendanceMarksConfig
                   │
Task ──N:1──> Course (optional, set null on delete)
Task ──N:1──> Project (optional, set null on delete)
Task ──N:1──> Domain (optional, set null on delete)
                   │
Project ──1:N──> Milestone
Project ──N:1──> Domain (cascade delete)
                   │
Routine ──1:N──> RoutineCompletion
```

---

## 5. Authentication

### 5.1 Supabase Auth (Primary)
- **Server Client:** `src/features/auth/lib/supabase-server.ts` — Uses `@supabase/ssr` with cookie-based session management
- **Browser Client:** `src/features/auth/lib/supabase-browser.ts` — Creates browser Supabase client
- **Server Actions:** `src/features/auth/lib/actions.ts` — `login()`, `signup()`, `logout()` using `signInWithPassword()`, `signUp()`, `signOut()`
- **Proxy Guard:** `src/app/proxy.ts` — Refreshes Supabase session on every request, redirects unauthenticated users to `/login`
- **Exemptions:** `/login`, `/signup`, `/auth`, `/api/widget/*`

### 5.2 Widget API Tokens (Secondary)
- **Purpose:** External API auth for Tasker/KWGT Android widgets
- **Mechanism:** SHA-256 hashed bearer tokens stored in `WidgetToken` table
- **Files:** `src/features/widget/lib/auth.ts`, `src/features/widget/lib/middleware.ts`
- **Pattern:** Single active token at a time; generating a new one revokes the old

### 5.3 Google Calendar OAuth (Tertiary)
- **Purpose:** Read-only Google Calendar sync
- **Flow:** OAuth 2.0 authorization code exchange with automatic token refresh
- **Scope:** `https://www.googleapis.com/auth/calendar.readonly`
- **Files:** `src/features/calendar/lib/google-calendar.ts`, `src/app/api/auth/google/callback/route.ts`

---

## 6. Styling System

### Tailwind CSS v4
- **PostCSS plugin:** `@tailwindcss/postcss` (v4 CSS-first config, no `tailwind.config.js`)
- **Global CSS:** `src/app/globals.css` — Imports `tailwindcss`, `tw-animate-css`, `shadcn/tailwind.css`

### shadcn/ui
- **Style:** base-nova with CSS variables, neutral base color
- **Components:** Button, Dialog, Sheet, Sonner (toasts)
- **Utility:** `cn()` function combining `clsx` + `tailwind-merge`
- **Config:** `components.json`

### Editorial Design System
Custom visual language defined in `globals.css`:

| Element | CSS Class | Description |
|---------|-----------|-------------|
| Section Labels | `.section-label` | Small-caps (0.65rem, 0.2em tracking, uppercase) |
| Page Headings | `.page-heading` | Serif (Playfair Display, 1.875rem, weight 700) |
| List Rows | `.list-row` | Text-forward rows without card wrapping |
| Streak Flame | `.streak-flame` | Red (#E54D2E) streak indicator |
| Sidebar Active | `.sidebar-link-active` | Accent background + foreground |
| Overdue Badge | `.overdue-badge` | Red uppercase badge (0.625rem) |

### Color Palette
```css
--background: #FAF8F5;    /* Warm off-white */
--foreground: #1A1A1A;    /* Near-black */
--card: #FFFFFF;           /* White cards */
--primary: #1A1A1A;        /* Near-black primary */
--secondary: #F0EDE8;      /* Warm gray */
--muted: #F0EDE8;          /* Muted background */
--muted-foreground: #6B6B6B; /* Gray text */
--destructive: #E54D2E;    /* Red for errors/overdue */
--border: #E5E2DD;         /* Warm border */
--ring: #A0A0A0;           /* Focus ring */

/* Chart colors */
--chart-1: #6B7FA3;  /* Slate Blue */
--chart-2: #7A9E7E;  /* Sage Green */
--chart-3: #C4868C;  /* Dusty Rose */
--chart-4: #C49B5C;  /* Amber */
--chart-5: #9B8EC4;  /* Lavender */

/* Sidebar */
--sidebar: #F5F3EF;
--sidebar-accent: #EDE9E3;
--sidebar-border: #E5E2DD;
```

### Fonts
- **Geist Sans** — Body text (`--font-geist-sans`)
- **Geist Mono** — Code (`--font-geist-mono`)
- **Playfair Display** — Serif headings (`--font-playfair`)

### Mobile Optimizations
- Touch target minimum: 44px
- Tap highlight removal (`-webkit-tap-highlight-color: transparent`)
- Smooth scrolling with `-webkit-overflow-scrolling: touch`
- Safe area padding (`env(safe-area-inset-bottom/top)`)
- Reduced motion support (`prefers-reduced-motion: reduce`)
- View transition animations (0.2s ease-in-out)
- Scroll snap for horizontal carousels

---

## 7. Feature Modules

### 7.1 Ask (AI Q&A)
- **Path:** `src/features/ask/`
- **Components:** `ChatInterface`
- **Lib:** `actions.ts` — Uses Knowledge Graph traversal to assemble context, sends to OpenRouter
- **Purpose:** Natural language Q&A about student's academic data

### 7.2 Assessments
- **Path:** `src/features/assessments/`
- **Components:** `AssessmentTable`
- **Lib:** `calculations.ts` — SGPA, CGPA, attendance percent, grade point lookup with configurable grading tables
- **Actions:** CRUD for assessments

### 7.3 Attendance
- **Path:** `src/features/attendance/`
- **Components:** `AttendanceCalendar`
- **Actions:** Mark attendance per class session
- **Data:** Per-class records (present/absent/cancelled/not_marked)

### 7.4 Auth
- **Path:** `src/features/auth/`
- **Lib:** `supabase-server.ts`, `supabase-browser.ts`, `actions.ts`
- **Purpose:** Supabase email/password authentication

### 7.5 Budget
- **Path:** `src/features/budget/`
- **Components:** `BudgetList`, `BudgetForm`, `BudgetSummary`, `EditBudgetDialog`
- **Actions:** CRUD for income/expense entries

### 7.6 Calendar
- **Path:** `src/features/calendar/`
- **Components:** `CalendarView`
- **Lib:** `google-calendar.ts` (358 lines) — OAuth 2.0 flow, token refresh, birthday detection, read-only sync
- **Actions:** Google Calendar connection, event management

### 7.7 Courses
- **Path:** `src/features/courses/`
- **Components:** `CourseForm`, `EditCourseDialog`, `CourseTasks`, `CourseNotes`, `AttendanceModeToggle`
- **Actions:** CRUD for courses

### 7.8 Dashboard
- **Path:** `src/features/dashboard/`
- **Components:** `TopThree`, `AllOpenTasks`, `TodaysClasses`, `UpNext`, `AttendanceAlerts`, `RoutinesWidget`, `SemesterSnapshot`, `TomorrowRoutines`, `DailyQuote`, `OngoingProjects`, `DailyTimeline`, `AiInsights`, `ContributionGraph`
- **Lib:** `queries.ts` (316 lines) — Aggregates all dashboard data in optimized parallel query phases using `Promise.all`
- **Actions:** `getCachedInsights()`, `refreshInsights()`

### 7.9 Domains
- **Path:** `src/features/domains/`
- **Actions:** CRUD for life categories (Personal, Finances, etc.)

### 7.10 Files (Placeholder)
- **Path:** `src/features/files/`
- **Status:** Empty `lib/` directory — planned for S3/MinIO file storage

### 7.11 Knowledge Graph
- **Path:** `src/features/knowledge-graph/`
- **Lib:** `traversal.ts` — On-demand BFS graph traversal from any entity via Prisma relations (N hops)
- **Functions:** `traverseGraph()`, `getCourseGraphContext()`, `searchEntitiesForContext()`, `formatGraphContext()`
- **Output:** `{ nodes, edges }` shape converted to markdown for AI consumption
- **Tests:** `__tests__/traversal.test.ts` — Integration tests with real DB

### 7.12 Library
- **Path:** `src/features/library/`
- **Components:** `ResourceList`, `ResourceForm`, `EditResourceDialog`, `QuoteList`, `QuoteForm`, `EditQuoteDialog`
- **Actions:** CRUD for saved readings/links and quotes

### 7.13 Notes
- **Path:** `src/features/notes/`
- **Components:** `NoteList`, `EditNoteDialog`, `QuickCapture`
- **Lib:** `ocr.ts` — Tesseract.js image-to-text processing; `nlp-parsing.ts` — AI-powered freeform text to structured task/note
- **Actions:** `actions.ts` (CRUD), `actions-ocr.ts` (OCR capture), `actions-nlp.ts` (NLP parsing)

### 7.14 Notifications
- **Path:** `src/features/notifications/`
- **Components:** `NotificationSettings`, `NotificationTypeToggles`, `DailySummarySettings`
- **Lib:** `scheduler.ts` (894 lines) — 8 notification types; `push-client.ts` — Browser push subscription management
- **Actions:** `actions.ts` (preferences), `subscription.ts` (push subscriptions)

### 7.15 People
- **Path:** `src/features/people/`
- **Components:** `PersonList`, `PersonForm`, `EditPersonDialog`
- **Actions:** CRUD for light CRM entries

### 7.16 Projects
- **Path:** `src/features/projects/`
- **Components:** `ProjectList`, `ProjectForm`, `EditProjectDialog`, `MilestoneList`, `MilestoneForm`
- **Lib:** `utils.ts` — `computeProjectProgress()` based on milestone weights
- **Actions:** CRUD for projects and milestones

### 7.17 Routines
- **Path:** `src/features/routines/`
- **Components:** `RoutineList`, `RoutineForm`, `EditRoutineDialog`
- **Lib:** `streaks.ts` — Merges RoutineCompletion + Task.completedAt into activity map, computes consecutive day streak (180-day window, cached 60s)
- **Actions:** `actions.ts` (CRUD), `actions-completions.ts` (completion toggling)

### 7.18 Schedule
- **Path:** `src/features/schedule/`
- **Components:** `ScheduleGrid`
- **Actions:** Schedule management for weekly recurring class slots

### 7.19 Search
- **Path:** `src/features/search/`
- **Components:** `SearchOverlay`, `SearchClient`, `SearchResults`
- **Lib:** `queries.ts` — Debounced search (300ms) across all entity types
- **Actions:** `actions.ts`
- **Trigger:** Cmd/Ctrl+K keyboard shortcut

### 7.20 Semesters
- **Path:** `src/features/semesters/`
- **Components:** `SemesterForm`, `EditSemesterDialog`
- **Actions:** CRUD for semesters

### 7.21 Settings
- **Path:** `src/features/settings/`
- **Components:** `GradingTableEditor`, `AttendanceTableEditor`, `AIProviderSettings`, `GoogleCalendarSettings`, `WidgetAccessSettings`
- **Actions:** `actions.ts`

### 7.22 Tasks
- **Path:** `src/features/tasks/`
- **Components:** `TaskList`, `TaskForm`, `TaskFilters`, `TaskLinkBadge`, `LinkToPicker`, `EditTaskDialog`
- **Actions:** CRUD for tasks with priority, status, due dates

### 7.23 Widget
- **Path:** `src/features/widget/`
- **Lib:** `auth.ts` (SHA-256 token management), `middleware.ts` (Bearer token validation), `actions.ts` (token CRUD)
- **Purpose:** REST API for external callers (Tasker/KWGT Android widgets)

---

## 8. AI Integration

### OpenRouter Client
- **File:** `src/lib/ai/openrouter.ts`
- **Model:** `openai/gpt-oss-120b` (configurable via `OPENROUTER_MODEL`)
- **Pattern:** `tryAI()` wrapper — never throws, always returns `AIResult<T>`

```typescript
type AIResult<T> = { ok: true; data: T } | { ok: false; error: string };
```

### Features Using AI

| Feature | File | Purpose |
|---------|------|---------|
| Ask AI | `features/ask/lib/actions.ts` | Q&A about academic data using Knowledge Graph context |
| Dashboard Insights | `features/dashboard/lib/actions.ts` | Generates 2-3 actionable insights; cached in `AiInsight` table |
| NLP Quick Capture | `features/notes/lib/nlp-parsing.ts` | Parses freeform text into structured tasks/notes |
| OCR | `features/notes/lib/ocr.ts` | Tesseract.js image-to-text (client-side) |

### Knowledge Graph Traversal
- **File:** `features/knowledge-graph/lib/traversal.ts`
- **Algorithm:** BFS traversal of Prisma relations up to N hops
- **No new database table** — reads from real foreign key relationships
- **Context search:** `searchEntitiesForContext()` searches across all entity types, assembles global context
- **Formatting:** `formatGraphContext()` converts graph to human-readable markdown for LLM prompts

### AI Cron
- **Endpoint:** `GET /api/cron/insights`
- **Runtime:** Node.js (explicitly set)
- **Purpose:** Refreshes cached AI insights via external cron job

---

## 9. API Routes

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/auth/google/callback` | GET | Supabase session | Google Calendar OAuth callback |
| `/api/cron/insights` | GET | None | Cron-triggered AI insight refresh |
| `/api/notifications/trigger` | GET | `CRON_SECRET` | Push notification scheduler trigger (5-min intervals) |
| `/api/widget/summary` | GET | Bearer token | Dashboard summary for external widgets |
| `/api/widget/quick-add` | POST | Bearer token | AI-parsed quick task/note creation |
| `/api/widget/tasks/[id]/toggle` | POST | Bearer token | Toggle task completion status |
| `/api/widget/routines/[id]/complete` | POST | Bearer token | Mark routine as completed |

### Widget API Details
- **Auth:** `Authorization: Bearer <token>` header
- **Token generation:** SHA-256 hashed, single active token at a time
- **Quick-add:** Uses NLP parsing to create tasks or notes from freeform text
- **Summary:** Returns today's top tasks, routines, upcoming events, birthdays, activity streak

---

## 10. Server Actions

All mutations use Next.js Server Actions (`"use server"` functions) instead of REST API routes for the main app.

| Module | File | Key Exports |
|--------|------|-------------|
| Auth | `features/auth/lib/actions.ts` | `login()`, `signup()`, `logout()` |
| Tasks | `features/tasks/lib/actions.ts` | CRUD for tasks |
| Courses | `features/courses/lib/actions.ts` | CRUD for courses |
| Notes | `features/notes/lib/actions.ts` | CRUD for notes |
| Notes OCR | `features/notes/lib/actions-ocr.ts` | OCR note capture |
| Notes NLP | `features/notes/lib/actions-nlp.ts` | NLP note parsing |
| Projects | `features/projects/lib/actions.ts` | CRUD for projects/milestones |
| Budget | `features/budget/lib/actions.ts` | CRUD for budget entries |
| People | `features/people/lib/actions.ts` | CRUD for people |
| Library | `features/library/lib/actions.ts` | CRUD for resources/quotes |
| Semesters | `features/semesters/lib/actions.ts` | CRUD for semesters |
| Routines | `features/routines/lib/actions.ts` | CRUD for routines |
| Routines | `features/routines/lib/actions-completions.ts` | Routine completion toggling |
| Domains | `features/domains/lib/actions.ts` | CRUD for domains |
| Assessments | `features/assessments/lib/actions.ts` | CRUD for assessments |
| Attendance | `features/attendance/lib/actions.ts` | Attendance marking |
| Schedule | `features/schedule/lib/actions.ts` | Schedule management |
| Calendar | `features/calendar/lib/google-actions.ts` | Google Calendar connection |
| Settings | `features/settings/lib/actions.ts` | Settings updates |
| Dashboard | `features/dashboard/lib/actions.ts` | `getCachedInsights()`, `refreshInsights()` |
| Ask | `features/ask/lib/actions.ts` | `askQuestion()` |
| Search | `features/search/lib/actions.ts` | Search actions |
| Widget | `features/widget/lib/actions.ts` | Widget token management |
| Notifications | `features/notifications/lib/actions.ts` | Notification preferences |
| Notifications | `features/notifications/lib/subscription.ts` | Push subscription management |

---

## 11. PWA Features

### Manifest
- **File:** `public/manifest.json`
- **Name:** "Academic Command Center"
- **Display:** standalone
- **Orientation:** portrait-primary
- **Categories:** education, productivity
- **Start URL:** `/today`
- **Icons:** 8 sizes (72, 96, 128, 144, 152, 192, 384, 512px)

### Service Worker
- **File:** `public/sw.js`
- **Caching:** App shell caching, network-first for API/static assets
- **Offline:** Fallback to `public/offline.html`
- **Push:** Handles push notification display

### Components
- `ServiceWorkerRegistration` — Registers SW in root layout
- `OfflineBanner` — Displays when network is unavailable
- `offline.html` — Static offline fallback page

### Icon Generation
- **Script:** `scripts/generate-icons.js`
- **Tool:** Sharp image processing library
- **Sizes:** 72, 96, 128, 144, 152, 192, 384, 512px

---

## 12. Push Notifications

### Scheduler (894 lines)
**File:** `src/features/notifications/lib/scheduler.ts`

| Notification Type | Timing | Description |
|-------------------|--------|-------------|
| Routine Reminders | Time-based | Reminds at routine's specific time |
| Task Due (Today) | Morning | Tasks due today |
| Task Due (Tomorrow) | Evening | Tasks due tomorrow |
| Class Start | 5-9 min before | Upcoming class alert |
| Assessment Reminders | Configurable | Assessment deadlines |
| Daily Summary Digest | Customizable time | Configurable sections (classes, tasks, routines, deadlines, attendance) |
| Missed Routine Alert | Evening | Routines not completed today |
| Overdue Task Alert | Morning | Tasks past due date |

### Client
- **File:** `src/features/notifications/lib/push-client.ts`
- **Purpose:** Browser push subscription management
- **Protocol:** Web Push (VAPID)

### Preferences
- Per-user notification type toggles
- Daily summary configuration (time, sections, timezone)
- **Model:** `NotificationPreference` in database

### Trigger
- **Endpoint:** `GET /api/notifications/trigger?secret=CRON_SECRET`
- **Interval:** External cron service every 5 minutes
- **Auth:** `CRON_SECRET` via query param or Bearer header

---

## 13. External Integrations

### Google Calendar
- **Scope:** Read-only (`calendar.readonly`)
- **Calendars:** Primary calendar + Birthdays calendar
- **Features:** OAuth 2.0 flow, automatic token refresh, birthday detection (by calendar source + title pattern matching)
- **File:** `src/features/calendar/lib/google-calendar.ts` (358 lines)
- **Storage:** `GoogleCalendarToken` model (access/refresh tokens per user)

### External Widget API (Tasker/KWGT)
- **Purpose:** REST API for Android widgets
- **Auth:** Bearer token (SHA-256 hashed)
- **Endpoints:** Summary, quick-add (NLP), task toggle, routine completion
- **Token management:** Single active token; new generation revokes old

### Object Storage (S3/MinIO)
- **Status:** Configured but not implemented
- **Endpoint:** MinIO on local network (`http://192.168.101.10:9004`)
- **Planned:** File upload/download for notes, Cloudflare Tunnel exposure
- **Config:** `.env` variables (`S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, etc.)

### Embedding Service (Planned)
- **Status:** Commented out in `.env`
- **Provider:** Hugging Face
- **Model:** `sentence-transformers/all-MiniLM-L6-v2`
- **Purpose:** Likely planned for semantic search or vector-based knowledge retrieval

---

## 14. State Management

### No External State Library
No Redux, Zustand, Jotai, Recoil, or React Context is used.

### Data Flow
1. **Server Components (default)** — Async components fetch data directly via Prisma
2. **Server Actions** — All mutations use `"use server"` functions
3. **URL Search Params** — Filtering state managed via URL (`status`, `project`, `course` params)
4. **React `cache()`** — Request-level deduplication (e.g., `getDashboardData`)
5. **In-Memory Cache (`MemCache`)** — TTL-based singleton on `globalThis`

### Cache TTLs
| Data | TTL |
|------|-----|
| Grading Configs | 10 minutes |
| Semesters | 5 minutes |
| Dashboard | 60 seconds |
| Auth | 5 minutes |
| Activity Streak | 60 seconds |

### Cache Implementation
```typescript
// src/lib/mem-cache.ts
export const memCache = globalForCache.__memCache ?? new MemCache();
if (process.env.NODE_ENV !== "production") globalForCache.__memCache = memCache;
```

### Client State
- Local `useState` in client components for UI state (dialog open/close, form inputs, loading)
- No global client state — all data comes from server components

### Cache Invalidation
- `revalidatePath()` after mutations
- `revalidate = 0` on pages requiring fresh data (dashboard, settings)

---

## 15. Testing

### Framework
- **Tool:** Vitest ^4.1.10
- **Config:** `vitest.config.ts`
- **Environment:** Node
- **Pattern:** `src/**/*.test.ts`
- **Globals:** Enabled

### Commands
```bash
npm test          # vitest run
npm run test:watch # vitest (watch mode)
```

### Test Files
- `src/features/knowledge-graph/lib/__tests__/traversal.test.ts` — Integration tests for graph traversal
  - Creates real DB data
  - Tests traversal, deduplication, filtering, context formatting
  - Skips gracefully if DB is unreachable

### Linting
- **Tool:** ESLint ^9
- **Config:** `eslint.config.mjs` (flat config)
- **Extends:** `eslint-config-next/core-web-vitals`, `eslint-config-next/typescript`
- **Command:** `npm run lint`

---

## 16. Deployment

### Platform
Vercel (evidenced by `vercel.json`, README)

### Configuration
- `vercel.json`: Empty (uses all defaults)
- **Build:** `next build`
- **Post-install:** `prisma generate`
- **Runtime:** Node.js (explicitly set for cron routes)

### Environment Variables Required

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key |
| `DATABASE_URL` | PostgreSQL connection string |
| `OPENROUTER_API_KEY` | OpenRouter AI API key |
| `OPENROUTER_MODEL` | AI model (default: `openai/gpt-oss-120b`) |
| `GOOGLE_CALENDAR_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CALENDAR_CLIENT_SECRET` | Google OAuth client secret |
| `GOOGLE_CALENDAR_REDIRECT_URI` | Google OAuth callback URL |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Web Push VAPID public key |
| `VAPID_PRIVATE_KEY` | Web Push VAPID private key |
| `VAPID_EMAIL` | VAPID contact email |
| `S3_ENDPOINT` | MinIO/S3 endpoint URL |
| `S3_REGION` | S3 region |
| `S3_FORCE_PATH_STYLE` | Path-style S3 access |
| `S3_ACCESS_KEY_ID` | S3 access key |
| `S3_SECRET_ACCESS_KEY` | S3 secret key |
| `S3_BUCKET` | S3 bucket name |
| `CRON_SECRET` | Secret for cron endpoints |

---

## 17. Key Libraries

### Production Dependencies

| Library | Version | Purpose |
|---------|---------|---------|
| `next` | 16.2.10 | React framework (App Router) |
| `react` / `react-dom` | 19.2.4 | UI library |
| `@prisma/client` | ^7.8.0 | Prisma ORM client |
| `@prisma/adapter-pg` | ^7.8.0 | PostgreSQL driver adapter |
| `prisma` | ^7.8.0 | Prisma CLI |
| `pg` | ^8.22.0 | PostgreSQL client |
| `@supabase/ssr` | ^0.12.0 | Supabase SSR helpers |
| `@supabase/supabase-js` | ^2.110.0 | Supabase client |
| `class-variance-authority` | ^0.7.1 | Component variant utility (CVA) |
| `clsx` | ^2.1.1 | Conditional class names |
| `tailwind-merge` | ^3.6.0 | Tailwind class deduplication |
| `tw-animate-css` | ^1.4.0 | Tailwind animation utilities |
| `framer-motion` | ^12.42.2 | React animations |
| `lucide-react` | ^1.23.0 | Icon library |
| `date-fns` | ^4.4.0 | Date manipulation |
| `googleapis` | ^173.0.0 | Google Calendar API |
| `web-push` | ^3.6.7 | Web Push notifications (VAPID) |
| `tesseract.js` | ^7.0.0 | Client-side OCR |
| `react-day-picker` | ^10.0.1 | Calendar/date picker component |
| `sonner` | ^2.0.7 | Toast notifications |
| `next-themes` | ^0.4.6 | Theme switching |
| `@base-ui/react` | ^1.6.0 | Base UI primitives |
| `shadcn` | ^4.13.0 | shadcn CLI |

### Dev Dependencies

| Library | Version | Purpose |
|---------|---------|---------|
| `@tailwindcss/postcss` | ^4 | Tailwind PostCSS plugin |
| `tailwindcss` | ^4 | Tailwind CSS |
| `typescript` | ^5 | TypeScript compiler |
| `eslint` | ^9 | Linter |
| `eslint-config-next` | 16.2.10 | Next.js ESLint config |
| `vitest` | ^4.1.10 | Test framework |
| `dotenv` | ^17.4.2 | Environment variable loading |
| `@types/node` | ^20 | Node.js type definitions |
| `@types/pg` | ^8.20.0 | PostgreSQL type definitions |
| `@types/react` | ^19 | React type definitions |
| `@types/react-dom` | ^19 | React DOM type definitions |
| `@types/web-push` | ^3.6.4 | Web Push type definitions |

---

## 18. Custom CSS Design System

### Editorial Utilities

```css
/* Small-caps section labels */
.section-label {
  font-size: 0.65rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  font-weight: 500;
  color: var(--muted-foreground);
}

/* Serif page headings */
.page-heading {
  font-family: var(--font-serif);  /* Playfair Display */
  font-weight: 700;
  font-size: 1.875rem;
  line-height: 1.2;
  color: var(--foreground);
  letter-spacing: -0.01em;
}

/* Text-forward list rows */
.list-row {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.625rem 0;
  border-bottom: 1px solid var(--border);
}

/* Streak flame indicator */
.streak-flame { color: #E54D2E; font-size: 0.75rem; }

/* Active sidebar link */
.sidebar-link-active {
  background-color: var(--sidebar-accent);
  color: var(--sidebar-accent-foreground);
  font-weight: 500;
}

/* Overdue badge */
.overdue-badge {
  color: var(--destructive);
  font-size: 0.625rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  font-weight: 600;
}
```

### Mobile Optimizations
```css
/* Touch target sizing */
@media (hover: none) and (pointer: coarse) {
  button, a, [role="button"] { min-height: 44px; }
  * { -webkit-tap-highlight-color: transparent; }
}

/* Smooth scrolling */
@media (max-width: 1023px) {
  html { scroll-behavior: smooth; -webkit-overflow-scrolling: touch; }
  body { -webkit-font-smoothing: antialiased; overflow-x: hidden; }
}

/* Safe area padding */
.safe-area-bottom { padding-bottom: env(safe-area-inset-bottom, 0px); }
.safe-area-top { padding-top: env(safe-area-inset-top, 0px); }

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}

/* Scroll snap */
.scroll-snap-x {
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;
}

/* Hide scrollbar */
.scrollbar-none { -ms-overflow-style: none; scrollbar-width: none; }
.scrollbar-none::-webkit-scrollbar { display: none; }
```

---

## 19. Type System

### Shared Types (`src/types/index.ts`)

| Type | Description |
|------|-------------|
| `SemesterWithCourses` | Semester with nested courses array |
| `CourseWithDetails` | Course with schedules, attendance, assessments, tasks, notes, configs |
| `CourseSummary` | Course with task/note counts |
| `TaskWithCourse` | Task with optional course and project picks |
| `NoteWithCourse` | Note with optional course pick |
| `DashboardData` | Full dashboard data shape (topTasks, routines, streaks, quotes, etc.) |
| `CalendarEvent` | Merged calendar view (classes, assessments, tasks, events) |
| `GradeResult` | Grading computation result (SGPA, CGPA, attendance) |
| `GraphNodeType` | Union of 16 entity types for Knowledge Graph |
| `GraphNode` | Graph node with id, type, data |
| `GraphEdge` | Graph edge with source, target, relation |
| `GraphResult` | `{ nodes: GraphNode[], edges: GraphEdge[] }` |
| `DailySummarySection` | Union of notification summary sections |

---

## 20. Configuration Files

| File | Purpose |
|------|---------|
| `next.config.ts` | Next.js config — marks `googleapis` as server external package |
| `tsconfig.json` | TypeScript — ES2017 target, strict mode, `@/*` path alias |
| `postcss.config.mjs` | PostCSS with `@tailwindcss/postcss` plugin |
| `eslint.config.mjs` | ESLint flat config — core-web-vitals + TypeScript |
| `vitest.config.ts` | Vitest — node env, `src/**/*.test.ts`, path alias |
| `components.json` | shadcn/ui — base-nova style, lucide icons, CSS variables |
| `prisma.config.ts` | Prisma — schema path, migrations, datasource URL |
| `.env` / `.env.local` | Environment variables (Supabase, OpenRouter, Google, VAPID, S3) |
| `vercel.json` | Vercel deployment (empty, uses defaults) |
| `public/manifest.json` | PWA manifest — "Academic Command Center" |
| `.gitignore` | Ignores node_modules, .next, .env*, build artifacts |

---

## Statistics

| Category | Count |
|----------|-------|
| React Components | ~70+ |
| Pages/Routes | 21 |
| API Endpoints | 7 |
| Server Action Modules | ~25 |
| Database Models | 24 |
| Prisma Enums | 12 |
| Feature Modules | 23 |
| Custom Utility Modules | ~15 |
| PWA Icon Sizes | 8 |
| Notification Types | 8 |

---

*Generated from codebase analysis on 2026-07-10.*
