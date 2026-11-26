# Academic Command Center — Architecture Documentation

> A personal academic productivity PWA for students — managing courses, attendance, grades, tasks, notes, routines, and projects. Built with Next.js 16 App Router, Prisma/PostgreSQL, Supabase Auth, and shadcn/ui. Features a second-brain note system with semantic linking, morning/evening briefs, and scheduled push alerts.

---

## Removed Features (Phase 2 Architecture Simplification)

The following features were audited, uninstalled, and deleted from the codebase during Phase 2 to streamline the application into a mobile-first, single-user academic workspace:

| Feature Removed | Previous Responsibility | Current Status / Responsibility Placement |
|---|---|---|
| **Energy System** | `energyRequirement`, `optimalTimeOfDay`, energy-based task scheduling | Deleted without replacement. Tasks now rely strictly on `dueDate`, `priority`, and status. |
| **Behavioral Patterns & Insights Feed** | Pattern detection, AI insight generation cron, insights UI & widgets | Deleted without replacement. Removed from dashboard, background jobs, and review summaries. |
| **Life Metrics** | Daily metric tracking (mood, sleep, energy), review prompt inputs | Deleted without replacement. |
| **Identities** | Identity-based routine grouping and identity creation | Deleted without replacement. Plain habits/routines are preserved and decoupled from identities. |
| **Client-side OCR** | In-browser OCR via `tesseract.js` for photo note capture | Deleted without replacement. `tesseract.js` uninstalled. Note attachments accept standard PDF/file uploads. |
| **Daily Review Framing** | Full daily review questionnaires, forms, and review page filters | Replaced by deterministic Morning and Evening Briefs (`DailyBrief` table, `/brief`). Weekly, monthly, and quarterly reviews are preserved. |
| **Knowledge-gap Detection** | Periodic gap analysis, gap cron job, and Knowledge Health Widget | Deleted without replacement. The core knowledge graph and note-linking traversal are preserved. |
| **People / Academic CRM** | Contact tracking, interaction logging, relationship importance, birthdays | Deleted without replacement. Clean calendar integration is preserved for scheduling. |
| **Budget** | Income/expense tracking, budget summaries, category analytics | Deleted without replacement. |
| **Library (Quotes & Resources)** | Quote collection, bookmark/resource database, `DailyQuote` widget | Deleted without replacement. Note attachment `DocumentLibrary` (`src/features/notes/components/DocumentLibrary.tsx`) is preserved for note files and PDFs. |
| **Unused Dependencies** | `tesseract.js`, `js-yaml`, `react-day-picker` | Uninstalled via `npm uninstall`. |
| **Dexie Local Database** | IndexedDB mirror storing energy and identity fields | Bumped schema to Version 3 with automated upgrade handler stripping removed columns without data loss. |

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
- [20. Layout Architecture](#20-layout-architecture)
- [21. Shared Components](#21-shared-components)
- [22. Upload System](#22-upload-system)
- [23. Configuration Files](#23-configuration-files)
- [24. Environment Variables](#24-environment-variables)
- [25. Statistics](#25-statistics)

---

## 1. Tech Stack

| Category | Technology | Version |
|----------|-----------|---------|
| Framework | Next.js (App Router) | 16.2.10 |
| Language | TypeScript | ^5 |
| React | React + React DOM | 19.2.4 |
| Database | PostgreSQL (via Supabase) | — |
| ORM | Prisma | ^7.8.0 |
| PostgreSQL Driver | `@prisma/adapter-pg` + `pg` | ^7.8.0 / ^8.22.0 |
| Auth | Supabase Auth | `@supabase/ssr` ^0.12.0, `@supabase/supabase-js` ^2.110.0 |
| Styling | Tailwind CSS | v4 (`@tailwindcss/postcss`) |
| UI Components | shadcn/ui | ^4.13.0 (base-nova style) |
| UI Primitives | `@base-ui/react` | ^1.6.0 |
| Animations | Framer Motion | ^12.42.2 |
| Icons | Lucide React | ^1.23.0 |
| Date Handling | date-fns | ^4.4.0 |
| AI | OpenRouter API | `openai/gpt-oss-120b` |
| Google APIs | googleapis | ^173.0.0 |
| Push Notifications | web-push | ^3.6.7 (VAPID) |
| PDF Rendering | react-pdf | ^10.4.1 |
| PDF Annotation | react-pdf-highlighter-extended | ^8.1.0 |
| Markdown | react-markdown | ^10.1.0 |
| Toasts | Sonner | ^2.0.7 |
| Themes | next-themes | ^0.4.6 |
| DOCX Conversion | mammoth | ^1.12.0 |
| HTML→Markdown | turndown | ^7.2.4 |
| Validation | zod | ^4.4.3 |
| Object Storage | `@aws-sdk/client-s3` + presigner | ^3.1085.0 |
| Data Visualization | d3 | ^7.9.0 |
| Testing | Vitest | ^4.1.10 |
| Linting | ESLint | ^9 (core-web-vitals + TypeScript) |
| Deployment | Google Cloud Run (`Dockerfile` / `cloudbuild.yaml`) | — |
| Package Manager | npm | — |
| Fonts | Geist Sans/Mono + Playfair Display | Via `next/font/google` |

---

## 2. Architecture Patterns

### Feature-Based Monolith
Single Next.js application organized into **26 feature modules** under `src/features/`. Each feature encapsulates its own server logic (`lib/actions.ts`, `lib/queries.ts`), components (`components/*.tsx`), and types. No microservices, no monorepo — one deployable unit.

### Server-First Architecture
- **Server Components by default** — Pages are async server components fetching data directly via Prisma
- **Server Actions** — All mutations use `"use server"` functions instead of REST endpoints
- **No client state management library** — No Redux, Zustand, Jotai, or React Context
- **URL Search Params** — Filtering state managed via URL (task status, course filter, etc.)
- **React `cache()`** — Request-level deduplication for data fetching
- **`revalidate = 0`** on all pages — Every page reads fresh from the database (no ISR caching)

### Key Patterns

| Pattern | Implementation |
|---------|---------------|
| Next.js App Router | Route groups `(app)` and `(auth)`, dynamic routes `[id]` |
| React `cache()` | Request-level deduplication for Prisma queries |
| In-Memory Caching | Custom `MemCache` singleton on `globalThis` with configurable TTL (60s–10min) |
| Knowledge Graph | On-demand BFS graph traversal from Prisma foreign keys (no extra table) |
| Graceful AI Degradation | `tryAI()` wrapper never throws, returns `AIResult<T>` |
| Graceful S3 Degradation | `tryS3()` wrapper never throws, returns `S3Result<T>` |
| PWA | Service Worker, manifest.json, offline support, push notifications |
| Dynamic Imports | Heavy components lazy-loaded via `next/dynamic` (ContributionGraph, UnifiedInsights, EnergyMap, ReviewPreviewWidget) |
| Proxy Auth Guard | Custom proxy function for Supabase session refresh on every request |
| Optimistic UI | `useOptimistic` + `useTransition` for instant task/routine toggle updates |
| Result Pattern | All server actions return `{ ok: true, data }` or `{ ok: false, error }` |

---

## 3. Directory Structure

```
├── .env                              # Environment variables
├── .env.local                        # Local overrides
├── .env.production                   # Production overrides
├── .gitignore
├── AGENTS.md                         # AI agent rules
├── ARCHITECTURE.md                   # This file
├── CLAUDE.md                         # Claude-specific instructions
├── components.json                   # shadcn/ui configuration
├── eslint.config.mjs                 # ESLint flat config
├── next.config.ts                    # Next.js configuration
├── next-env.d.ts                     # Next.js TypeScript declarations
├── package.json                      # Dependencies and scripts
├── package-lock.json                 # Lock file
├── postcss.config.mjs                # PostCSS config (Tailwind)
├── prisma.config.ts                  # Prisma configuration
├── tsconfig.json                     # TypeScript configuration
├── tsconfig.tsbuildinfo              # TypeScript build info
├── vercel.json                       # Vercel deployment config
├── vitest.config.ts                  # Vitest test configuration
│
├── prisma/
│   ├── schema.prisma                 # Database schema (28 models, 20 enums)
│   ├── seed.ts                       # Seeds 30 motivational quotes
│   └── migrations/                   # Database migrations
│
├── public/
│   ├── manifest.json                 # PWA manifest
│   ├── sw.js                         # Service Worker (269 lines)
│   └── icon-*.png                    # PWA icons (8 sizes)
│
├── scripts/
│   └── generate-icons.js             # PWA icon generator (Sharp)
│
└── src/
    ├── app/                          # Next.js App Router
    │   ├── layout.tsx                # Root layout (fonts, Toaster, SW registration)
    │   ├── page.tsx                  # Root → redirects to /today
    │   ├── globals.css               # Global styles + editorial design system
    │   ├── proxy.ts                  # Auth middleware proxy
    │   │
    │   ├── (app)/                    # Authenticated route group
    │   │   ├── layout.tsx            # App shell (sidebar, mobile tabs, FAB, banners)
    │   │   ├── loading.tsx           # Loading skeleton state
    │   │   ├── today/page.tsx        # Main dashboard (home page)
    │   │   ├── tasks/page.tsx        # Task management
    │   │   ├── calendar/page.tsx     # Monthly calendar view
    │   │   ├── semesters/page.tsx    # Semester list with SGPA/CGPA
    │   │   ├── semesters/[id]/       # Semester detail
    │   │   │   └── page.tsx
    │   │   ├── courses/[id]/         # Course detail (7 sections)
    │   │   │   └── page.tsx
    │   │   ├── routines/             # Habit tracking + identities
    │   │   │   ├── page.tsx
    │   │   │   └── identities/[id]/
    │   │   │       └── page.tsx
    │   │   ├── notes/                # Notes + document library
    │   │   │   ├── page.tsx
    │   │   │   └── [id]/page.tsx
    │   │   ├── projects/             # Project tracking
    │   │   │   ├── page.tsx
    │   │   │   └── [id]/page.tsx
    │   │   ├── budget/page.tsx       # Income/expense tracking
    │   │   ├── library/page.tsx      # Quotes + resources
    │   │   ├── people/               # Light CRM
    │   │   │   ├── page.tsx
    │   │   │   └── [id]/page.tsx
    │   │   ├── reviews/              # AI-generated reviews
    │   │   │   ├── page.tsx
    │   │   │   └── [id]/page.tsx
    │   │   ├── search/page.tsx       # Full-text search
    │   │   ├── ask/page.tsx          # AI Q&A chatbot
    │   │   ├── settings/page.tsx     # App configuration
    │   │   └── more/page.tsx         # Navigation hub
    │   │
    │   ├── (auth)/                   # Unauthenticated route group
    │   │   ├── layout.tsx
    │   │   ├── login/page.tsx
    │   │   └── signup/page.tsx
    │   │
    │   └── api/                      # API Routes
    │       ├── auth/google/callback/route.ts
    │       ├── attendance/mark-from-push/route.ts
    │       ├── cron/
    │       │   ├── insights/route.ts
    │       │   ├── knowledge-gaps/route.ts
    │       │   └── reviews/route.ts
    │       ├── notes/
    │       │   ├── graph/route.ts
    │       │   ├── link-metadata/route.ts
    │       │   └── [id]/
    │       │       ├── related/route.ts
    │       │       └── backlinks/route.ts
    │       ├── notifications/trigger/route.ts
    │       └── widget/
    │           ├── summary/route.ts
    │           ├── quick-add/route.ts
    │           ├── tasks/[id]/toggle/route.ts
    │           └── routines/[id]/complete/route.ts
    │
    ├── components/
    │   ├── layout/                   # App shell components
    │   │   ├── sidebar.tsx           # Desktop sidebar (13 nav items)
    │   │   ├── mobile-tabs.tsx       # Mobile bottom tab bar (4 tabs + More)
    │   │   ├── mobile-nav-sheet.tsx  # Mobile hamburger menu sheet
    │   │   ├── fab-cluster.tsx       # Floating action button (Task/Note/Budget)
    │   │   └── overdue-banner.tsx    # Persistent overdue tasks warning
    │   │
    │   ├── shared/                   # Cross-feature reusable components
    │   │   ├── page-header.tsx       # Reusable page header with back link
    │   │   ├── page-transition.tsx   # Framer Motion page transitions
    │   │   ├── empty-state.tsx       # Empty state placeholder
    │   │   ├── loading.tsx           # Loading skeleton
    │   │   ├── swipe-to-reveal.tsx   # Touch swipe for mobile actions
    │   │   ├── offline-banner.tsx    # PWA offline indicator
    │   │   ├── service-worker-registration.tsx
    │   │   └── linked-notes-section.tsx
    │   │
    │   ├── upload/                   # File upload components
    │   │   ├── DropZone.tsx          # Drag-and-drop zone
    │   │   ├── FileUploader.tsx      # Multi-file upload orchestrator
    │   │   └── UploadProgress.tsx    # Per-file progress indicator
    │   │
    │   └── ui/                       # shadcn/ui primitives
    │       ├── button.tsx            # CVA variants (6 styles, 8 sizes)
    │       ├── dialog.tsx            # Base UI dialog
    │       ├── sheet.tsx             # Slide-over panel
    │       ├── sonner.tsx            # Toast notifications
    │       └── context-menu.tsx      # Right-click context menu
    │
    ├── features/                     # Feature modules (26 total)
    │   ├── ask/                      # AI Q&A assistant
    │   │   ├── components/chat-interface.tsx
    │   │   └── lib/actions.ts
    │   ├── assessments/              # Grade/assessment tracking
    │   │   └── lib/ (actions, calculations, queries)
    │   ├── attendance/               # Attendance calendar + marking
    │   │   └── lib/ (actions, queries)
    │   ├── auth/                     # Supabase authentication
    │   │   └── lib/ (supabase-server, supabase-browser, actions)
    │   ├── budget/                   # Income/expense tracking
    │   │   └── lib/ + components/
    │   ├── calendar/                 # Calendar + Google Calendar sync
    │   │   ├── components/calendar-view.tsx
    │   │   └── lib/ (google-calendar.ts, google-actions.ts)
    │   ├── courses/                  # Course management
    │   │   └── lib/ + components/
    │   ├── dashboard/                # Main dashboard (Today page)
    │   │   ├── components/ (TopThree, AllOpenTasks, DailyTimeline, etc.)
    │   │   └── lib/queries.ts (316 lines)
    │   ├── domains/                  # Life categories
    │   ├── files/                    # File storage (S3/MinIO)
    │   │   └── components/ (FileManager, FileList, FileUploadDialog)
    │   ├── identities/               # Identity-first habit design
    │   │   ├── components/ (IdentityCard, IdentityGrid, IdentityForm, IdentityDetail, IdentityHealthWidget)
    │   │   └── lib/actions.ts
    │   ├── insights/                 # Behavioral intelligence engine
    │   │   ├── components/ (InsightCard, InsightFeed, InsightSeverityBadge, etc.)
    │   │   └── lib/ (detection.ts 1458 lines, ai-insights.ts 505 lines)
    │   ├── knowledge-graph/          # Entity relationship traversal
    │   │   └── lib/traversal.ts (714 lines)
    │   ├── library/                  # Quotes + saved resources
    │   │   └── lib/ + components/
    │   ├── notes/                    # Notes (second brain)
    │   │   ├── components/ (31 component files)
    │   │   └── lib/ (12+ lib files)
    │   ├── notifications/            # Web Push + scheduler
    │   │   └── lib/ (scheduler.ts 1237 lines, push-client.ts, subscription.ts)
    │   ├── people/                   # Light CRM
    │   │   └── lib/ + components/
    │   ├── projects/                 # Non-academic project tracking
    │   │   ├── lib/utils.ts
    │   │   └── components/
    │   ├── routines/                 # Habit tracking + streaks + identities
    │   │   ├── components/ (RoutineList, EnergyMap, etc.)
    │   │   └── lib/ (actions, streaks.ts)
    │   ├── reviews/                  # AI-generated periodic reviews
    │   │   ├── components/ (ReviewDetail, ReviewList, ReviewMetricsDisplay, etc.)
    │   │   └── lib/ (generator.ts, prompts.ts, data-summary.ts, types.ts)
    │   ├── schedule/                 # Class schedule grid
    │   ├── search/                   # Global search (Cmd+K)
    │   │   └── components/ (SearchOverlay, SearchClient, SearchResults)
    │   ├── semesters/                # Semester management
    │   ├── settings/                 # Settings page logic
    │   │   └── lib/ (actions.ts, queries.ts)
    │   ├── tasks/                    # Task management
    │   │   ├── components/ (TaskList, TaskForm, TaskFilters, LinkToPicker, etc.)
    │   │   └── lib/ (actions.ts, queries.ts)
    │   └── widget/                   # External widget API (Tasker/KWGT)
    │       └── lib/ (auth.ts, middleware.ts, actions.ts)
    │
    ├── lib/                          # Shared utilities
    │   ├── ai/openrouter.ts          # OpenRouter AI client
    │   ├── auth.ts                   # getCurrentUserId() with 5-min cache
    │   ├── constants.ts              # Nav items, colors, defaults
    │   ├── course-utils.ts           # isCourseEnded() check
    │   ├── energy-curve.ts           # Energy level computation
    │   ├── mem-cache.ts              # In-memory cache with TTL
    │   ├── prisma.ts                 # Prisma client singleton
    │   ├── use-is-mobile.ts          # Mobile viewport hook
    │   ├── utils.ts                  # cn() utility
    │   ├── pdf/setup.ts              # PDF.js worker configuration
    │   └── s3/                       # S3/MinIO client
    │       ├── client.ts
    │       ├── actions.ts
    │       └── types.ts
    │
    └── types/
        └── index.ts                  # Shared TypeScript types (353 lines)
```

---

## 4. Database

### Provider
PostgreSQL hosted on Supabase

### ORM
Prisma ^7.8.0 with `@prisma/adapter-pg` (PostgreSQL driver adapter, **library engine type**). Uses `pg.Pool` with max 5 connections, 30s idle timeout, SSL enabled. Dual connection URLs: `DATABASE_URL` (pooled via PgBouncer on port 6543) and `DIRECT_URL` (direct connection on port 5432 for migrations).

### Models (28 total)

#### Academic Models
| Model | Table | Key Fields | Description |
|-------|-------|------------|-------------|
| `Semester` | `semesters` | name, startDate, endDate, gradingScale, isActive | Academic terms with grading config |
| `Course` | `courses` | semesterId, name, code, credits, instructor, color, targetGrade, attendanceMode, manualPresent, manualTotalClasses | Courses within semesters |
| `ClassSchedule` | `class_schedules` | courseId, dayOfWeek, startTime, endTime, location, effectiveStartDate, effectiveEndDate | Weekly recurring time slots |
| `ScheduleException` | `schedule_exceptions` | classScheduleId, date, type (cancelled/rescheduled), newStartTime, newEndTime, newLocation | Per-day schedule overrides (compound unique on classScheduleId+date) |
| `AttendanceRecord` | `attendance_records` | courseId, date, status (present/absent/cancelled/not_marked) | Per-class attendance (compound unique on courseId+date) |
| `Assessment` | `assessments` | courseId, componentType, maxMarks, obtainedMarks, date | Grading components (minor, mid-sem, end-sem, attendance) |
| `GradingConfig` | `grading_configs` | courseId?, semesterId?, minPercent, gradePoint | Marks%-to-grade-point conversion (10-point scale default) |
| `AttendanceMarksConfig` | `attendance_marks_configs` | courseId?, semesterId?, minPercent, marks | Attendance%-to-marks table (out of 5 default) |

#### Task & Note Models
| Model | Table | Key Fields | Description |
|-------|-------|------------|-------------|
| `Task` | `tasks` | userId, title, notes, dueDate, priority, status, courseId?, projectId?, domainId?, starred, completedAt, energyRequirement, estimatedDuration, optimalTimeOfDay, sortPriority | Tasks with energy sequencing fields |
| `Note` | `notes` | userId, title?, content, sourceType, sourceLink?, tags[], courseId?, taskId?, projectId?, isDocumentLibraryEntry, folderId?, documentType?, s3Key?, s3Url?, fileSize?, fileName?, mimeType?, pageCount?, thumbnailUrl?, originalUrl?, embedHtml?, extractedText?, lastViewedAt, viewCount, isPinned, isFavorite, lastReviewedAt, reviewCount | Notes with document library + spaced repetition fields |
| `NoteLink` | `note_links` | sourceId, targetId, strength, linkType (semantic/explicit) | Semantic or explicit links between notes (compound unique) |
| `NoteAttachment` | `note_attachments` | noteId, userId, type (AttachmentType enum), title, s3Key, s3Url, fileSize, fileName, mimeType, thumbnailUrl?, pageCount?, extractedText?, sortOrder | File and link attachments for notes |
| `NoteAnnotation` | `note_annotations` | noteId?, fileAttachmentId?, userId, type, pageNumber, position (JSON), text?, color | Page-level annotations (highlights, underlines, strikeouts, notes, bookmarks) |
| `DocumentFolder` | `document_folders` | userId, name, description?, type (FolderType enum), color?, icon?, parentId?, courseId?, semesterId?, sortOrder, isPinned | Hierarchical folder structure (self-referencing parent/children) |

#### Routine & Identity Models
| Model | Table | Key Fields | Description |
|-------|-------|------------|-------------|
| `Routine` | `routines` | userId, name, timeOfDay, specificTime?, streakGoal?, activeDays[], energyImpact, category?, flowTrigger?, identityId? | Daily/weekly habits with energy and identity linking |
| `RoutineCompletion` | `routine_completions` | routineId, date, completedAt | Daily habit completion records (compound unique on routineId+date) |
| `Identity` | `identities` | userId, statement, description?, status, color?, icon? | Identity-first habit statements |

#### Project Models
| Model | Table | Key Fields | Description |
|-------|-------|------------|-------------|
| `Domain` | `domains` | userId, name, color?, isDefault | Life categories (Personal, Finances, etc.) |
| `Project` | `projects` | domainId, name, description?, color?, status (active/completed/archived) | Non-academic projects |
| `Milestone` | `milestones` | projectId, name, weight, isDone | Weighted milestones within projects |

#### Other Models
| Model | Table | Key Fields | Description |
|-------|-------|------------|-------------|
| `Event` | `events` | userId, title, dateTime, location?, notes?, eventType (general/birthday/class/assessment) | Calendar events |
| `Quote` | `quotes` | userId, text, source?, tags[] | Library quotes |
| `BudgetEntry` | `budget_entries` | userId, type (income/expense), amount (Decimal 10,2), category, date, notes? | Income/expense tracking |
| `Resource` | `resources` | userId, title, url?, notes?, tags[] | Saved readings/links |
| `Person` | `people` | userId, name, birthday?, notes?, lastContact?, contactFrequency?, relationshipType?, energyImpact, importanceScore? | Light CRM |
| `Review` | `reviews` | userId, type (daily/weekly/monthly/quarterly), periodStart, periodEnd, status (generated/viewed/archived), summary, sections (JSON), actions (JSON), metrics (JSON), viewedAt? | AI-generated periodic reviews |
| `FileAttachment` | `file_attachments` | userId, fileName, fileSize, contentType, key (S3), url, semesterId?, courseId?, category?, tags[], description?, uploadedAt | File uploads with annotations |
| `PushSubscription` | `push_subscriptions` | userId, endpoint, p256dh, auth | Web Push subscription endpoints |
| `NotificationPreference` | `notification_preferences` | userId, type, enabled, dailySummaryTime?, dailySummarySections[], timezone? | Per-user notification toggles (compound unique on userId+type) |
| `SentNotification` | `sent_notifications` | userId, tag, sentAt | Deduplication tracker (compound unique on userId+tag) |
| `GoogleCalendarToken` | `google_calendar_tokens` | userId, accessToken, refreshToken, expiresAt | OAuth tokens for Google Calendar sync |
| `WidgetToken` | `widget_tokens` | userId, tokenHash, createdAt, lastUsedAt?, revokedAt? | SHA-256 hashed bearer tokens for external widgets |
| `IgnoredInsight` | `ignored_insights` | userId, type, title, description, severity, evidence (JSON), dismissedAt?, actedOn | AI insights with dismissal tracking |
| `BehavioralPattern` | `behavioral_patterns` | userId, pattern, detectedAt, severity, evidence (JSON), resolvedAt?, resolution? | Detected behavioral patterns |
| `LifeMetric` | `life_metrics` | userId, category, value, recordedAt, source, confidence, notes? | Quantified self data |
| `AiInsight` | `ai_insights` | userId, insights[] | **Deprecated** — `@@ignore`, kept for data retention |

### Enums (20 total)

| Enum | Values |
|------|--------|
| `GradingScale` | `ten_point`, `four_point` |
| `AttendanceMode` | `auto`, `manual` |
| `DayOfWeek` | `MON`, `TUE`, `WED`, `THU`, `FRI`, `SAT`, `SUN` |
| `ScheduleExceptionType` | `cancelled`, `rescheduled` |
| `AttendanceStatus` | `present`, `absent`, `cancelled`, `not_marked` |
| `AssessmentType` | `minor_assignment`, `attendance`, `mid_sem`, `end_sem` |
| `TaskStatus` | `open`, `done` |
| `SourceType` | `typed`, `ocr_photo`, `voice`, `uploaded_pdf`, `uploaded_pptx`, `uploaded_doc` |
| `AttachmentType` | `PDF`, `IMAGE`, `VIDEO`, `AUDIO`, `DOCUMENT`, `TEXT`, `LINK`, `OTHER` |
| `FolderType` | `PYQ`, `RESOURCE_BOOK`, `LECTURE_NOTE`, `ASSIGNMENT`, `REFERENCE`, `PROJECT`, `GENERAL` |
| `EventType` | `general`, `birthday`, `class`, `assessment` |
| `TimeOfDay` | `morning`, `afternoon`, `evening`, `anytime` |
| `ProjectStatus` | `active`, `completed`, `archived` |
| `BudgetType` | `income`, `expense` |
| `InsightSeverity` | `info`, `warning`, `critical`, `positive` |
| `InsightType` | `declining_skill`, `burnout_risk`, `missed_opportunity`, `relationship_drift`, `energy_mismatch`, `budget_anomaly`, `knowledge_gap`, `focus_fragmentation`, `achievement`, `positive_trend`, `streak_milestone` |
| `PatternType` | `procrastination_spike`, `energy_crash`, `social_isolation`, `overspending`, `learning_decay`, `attendance_decline`, `task_avoidance` |
| `EnergyImpact` | `charging`, `draining`, `neutral` |
| `IdentityStatus` | `aspirational`, `developing`, `integrated`, `neglected` |
| `ReviewType` | `daily`, `weekly`, `monthly`, `quarterly` |
| `ReviewStatus` | `generated`, `viewed`, `archived` |

### Key Relationships

```
Semester ──1:N──> Course ──1:N──> ClassSchedule ──1:N──> ScheduleException
                   │──1:N──> AttendanceRecord
                   │──1:N──> Assessment
                   │──1:N──> GradingConfig
                   │──1:N──> AttendanceMarksConfig
                   │──1:N──> Task (optional)
                   │──1:N──> Note (optional)
                   │──1:N──> DocumentFolder (optional)
                   │──1:N──> FileAttachment (optional)
                   │
Task ──N:1──> Course (optional)
Task ──N:1──> Project (optional)
Task ──N:1──> Domain (optional)
                   │
Note ──N:1──> Course (optional)
Note ──N:1──> Task (optional)
Note ──N:1──> Project (optional)
Note ──N:1──> DocumentFolder (optional)
Note ──1:N──> NoteAttachment
Note ──1:N──> NoteAnnotation
Note ──M:M──> Note (via NoteLink, self-referencing)
                   │
DocumentFolder ──N:1──> DocumentFolder (self-referencing, parentId)
DocumentFolder ──1:N──> DocumentFolder (children)
DocumentFolder ──N:1──> Course (optional)
DocumentFolder ──N:1──> Semester (optional)
                   │
Routine ──1:N──> RoutineCompletion
Routine ──N:1──> Identity (optional)
                   │
Identity ──1:N──> Routine
                   │
Project ──1:N──> Milestone
Project ──N:1──> Domain (cascade delete)
                   │
NoteAnnotation ──N:1──> Note (optional)
NoteAnnotation ──N:1──> FileAttachment (optional)
                   │
FileAttachment ──1:N──> NoteAnnotation
FileAttachment ──N:1──> Semester (optional)
FileAttachment ──N:1──> Course (optional)
```

---

## 5. Authentication

### 5.1 Supabase Auth (Primary)
- **Server Client:** `src/features/auth/lib/supabase-server.ts` — Uses `@supabase/ssr` with `cookies()` for cookie-based session management
- **Browser Client:** `src/features/auth/lib/supabase-browser.ts` — Creates browser Supabase client via `createBrowserClient`
- **Server Actions:** `src/features/auth/lib/actions.ts` — `login()` (signInWithPassword), `signup()` (signUp), `logout()` (signOut)
- **User ID Resolution:** `src/lib/auth.ts` — `getCurrentUserId()` returns Supabase user ID or `"default-user"` fallback, cached via `memCache` for 5 minutes
- **Proxy Guard:** `src/app/proxy.ts` — Middleware that refreshes Supabase session on every request via `getUser()`, redirects unauthenticated users to `/login`
- **Exemptions:** `/login`, `/signup`, `/auth`, `/api/widget/*` are skipped by the proxy

### 5.2 Widget API Tokens (Secondary)
- **Purpose:** External API auth for Tasker/KWGT Android widgets
- **Token Generation:** 32-byte random hex string, shown once at generation, never stored raw
- **Storage:** SHA-256 hash stored in `WidgetToken` table with `createdAt`, `lastUsedAt`, `revokeAt`
- **Single Active Token:** Generating a new token revokes all existing active tokens
- **Files:** `src/features/widget/lib/auth.ts` (token lifecycle), `src/features/widget/lib/middleware.ts` (Bearer validation)
- **Auth Header:** `Authorization: Bearer <token>` extracted and verified on every widget API request

### 5.3 Google Calendar OAuth (Tertiary)
- **Purpose:** Read-only Google Calendar sync
- **Scope:** `https://www.googleapis.com/auth/calendar.readonly`
- **Flow:** OAuth 2.0 authorization code exchange → access/refresh tokens stored in `GoogleCalendarToken`
- **Token Refresh:** Automatic via `googleapis` library
- **Calendars Synced:** Primary calendar + Birthdays calendar (detected by calendar ID pattern + title pattern)
- **Files:** `src/features/calendar/lib/google-calendar.ts` (358 lines), `src/app/api/auth/google/callback/route.ts`

---

## 6. Styling System

### Tailwind CSS v4
- **PostCSS plugin:** `@tailwindcss/postcss` (v4 CSS-first config, no `tailwind.config.js`)
- **Global CSS:** `src/app/globals.css` — Imports `tailwindcss`, `tw-animate-css`, `shadcn/tailwind.css`

### shadcn/ui
- **Style:** base-nova with CSS variables, neutral base color
- **Components:** Button (6 variants, 8 sizes), Dialog, Sheet (4 sides), Sonner (toasts), Context Menu
- **Utility:** `cn()` function combining `clsx` + `tailwind-merge`
- **Config:** `components.json` — RSC enabled, TSX, lucide icons, CSS variables

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
--background: #FAF8F5;      /* Warm off-white */
--foreground: #1A1A1A;      /* Near-black */
--card: #FFFFFF;             /* White cards */
--primary: #1A1A1A;          /* Near-black primary */
--secondary: #F0EDE8;        /* Warm gray */
--muted: #F0EDE8;            /* Muted background */
--muted-foreground: #6B6B6B; /* Gray text */
--destructive: #E54D2E;      /* Red for errors/overdue */
--border: #E5E2DD;           /* Warm border */
--ring: #A0A0A0;             /* Focus ring */

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

### Course Colors (8 presets)
| Name | Hex |
|------|-----|
| Slate Blue | `#6B7FA3` |
| Sage Green | `#7A9E7E` |
| Dusty Rose | `#C4868C` |
| Amber | `#C49B5C` |
| Lavender | `#9B8EC4` |
| Teal | `#5C9E9E` |
| Coral | `#D4845C` |
| Slate | `#7A8B99` |

### Fonts
- **Geist Sans** — Body text (`--font-geist-sans`)
- **Geist Mono** — Code (`--font-geist-mono`)
- **Playfair Display** — Serif headings (`--font-playfair`, `display: "swap"`)

### Mobile Optimizations
- Touch target minimum: 44px
- Tap highlight removal (`-webkit-tap-highlight-color: transparent`)
- Smooth scrolling with `-webkit-overflow-scrolling: touch`
- Safe area padding (`env(safe-area-inset-bottom/top)`)
- Reduced motion support (`prefers-reduced-motion: reduce`)
- View transition animations (0.2s ease-in-out)
- Scroll snap for horizontal carousels
- Hidden scrollbar utility (`.scrollbar-none`)

---

## 7. Feature Modules

### 7.1 Ask (AI Q&A)
- **Path:** `src/features/ask/`
- **Components:** `ChatInterface` — message history (user/assistant bubbles), suggested questions, loading spinner, error handling, context indicator, auto-scroll
- **Lib:** `actions.ts` — `askQuestion()` uses Knowledge Graph traversal (`searchEntitiesForContext`) to assemble context across all entity types, adds global context (open tasks, today's routines, active semester), sends to OpenRouter (temperature 0.3, max 1024 tokens)
- **Suggested Questions:** "What's due this week in Physics?", "How's my attendance in Data Structures?"
- **Error Handling:** "AI temporarily unavailable" message, graceful degradation

### 7.2 Assessments
- **Path:** `src/features/assessments/`
- **Components:** `AssessmentTable`
- **Lib:** `calculations.ts` — `computeSGPA()`, `computeCGPA()`, `computeAttendancePercent()`, `computeGradePoint()`, `computeAttendanceMarks()` with configurable grading tables
- **Actions:** CRUD for assessments per course

### 7.3 Attendance
- **Path:** `src/features/attendance/`
- **Components:** `AttendanceCalendar` — calendar with present/absent/late markers
- **Actions:** Mark attendance per class session (present/absent/cancelled/not_marked)
- **Modes:** Auto (computed from records) or Manual (user-provided present/total counts)
- **Push Integration:** Mark attendance from push notification action buttons (`/api/attendance/mark-from-push`)

### 7.4 Auth
- **Path:** `src/features/auth/`
- **Lib:** `supabase-server.ts`, `supabase-browser.ts`, `actions.ts`
- **Pages:** `/login` (email + password), `/signup` (email + password, min 6 chars)

### 7.5 Briefs (`/brief`)
- **Path:** `src/features/briefs/`
- **Purpose:** Deterministic Morning & Evening Briefs (`DailyBrief` table), Open-Meteo city weather & 3h DB cache, and Travel ticket offline pinning (`EventDocument` + `pinned-documents-v1`).

### 7.6 Calendar
- **Path:** `src/features/calendar/`
- **Components:** `CalendarView` — Monthly grid with color-coded events (blue=class, amber=assessment, green=task, purple=event), today highlight, "+N more" overflow
- **Lib:** `google-calendar.ts` (358 lines) — OAuth 2.0 flow, token refresh, birthday detection (by calendar source + title pattern matching), read-only sync
- **Actions:** Google Calendar connection/disconnection, event management

### 7.7 Courses
- **Path:** `src/features/courses/`
- **Components:** `CourseForm`, `EditCourseDialog`, `CourseTasks`, `CourseNotes`, `AttendanceModeToggle`
- **Detail Page Sections:** Schedule, Attendance (calendar + mode toggle), Assessments (table with marks), Tasks, Notes, Files, Edit dialog
- **Actions:** CRUD for courses with credits, instructor, color, target grade

### 7.8 Dashboard (Today Page)
- **Path:** `src/features/dashboard/`
- **Components:**
  - `TopThree` — Highlights 3 most important tasks (starred, high-priority)
  - `AllOpenTasks` — Complete list of all open tasks
  - `DailyTimeline` — Visual timeline combining today's classes, deadlines, and routines
  - `UpNext` — Upcoming deadlines (excluding today)
  - `OngoingProjects` — Active project cards with progress
  - `AttendanceAlerts` — Courses below attendance threshold
  - `RoutinesWidget` — Today's routines with completion status
  - `SemesterSnapshot` — SGPA/CGPA display
  - `TomorrowRoutines` — Routines for tomorrow (deduplicated)
  - `DailyQuote` — Inspirational quote from Library
  - `ContributionGraph` — Activity streak visualization (dynamic import)
  - `IdentityHealthWidget` — Identity strength indicators (dynamic import)
  - `UnifiedInsights` — AI + rule-based behavioral insights feed (dynamic import)
  - `EnergyMap` — SVG energy curve visualization (dynamic import)
  - `ReviewPreviewWidget` — Latest AI-generated review + unviewed count (dynamic import)
  - `FocusCarousel` — Rotating streak data, top tasks, classes, routines
- **Lib:** `queries.ts` (316 lines) — Aggregates all dashboard data in optimized parallel query phases using `Promise.all`
- **Layout:** Responsive 3-column grid on desktop (2/3 main + 1/3 sidebar), 2-column on tablet, stacked on mobile

### 7.9 Domains
- **Path:** `src/features/domains/`
- **Actions:** CRUD for life categories (Personal, Finances, Academics, etc.)
- **Usage:** Categorizes projects; tasks auto-derive `domainId` from linked project

### 7.10 Files
- **Path:** `src/features/files/`
- **Components:** `FileManager` (category/tag filtering: syllabus, routine, calendar, other), `FileList` (display with delete), `FileUploadDialog` (progress tracking)
- **Storage:** S3/MinIO via presigned URLs

### 7.11 DSA Progress Tracker (`/dsa`)
- **Path:** `src/features/dsa/`
- **Purpose:** Online-only 90-day DSA tracker (topics, imported problems, append-only attempt history, spaced revision queue, sessions, contests, Tutor Report export, and full JSON backup/restore).

### 7.13 Knowledge Graph
- **Path:** `src/features/knowledge-graph/`
- **Lib:** `traversal.ts` (714 lines) — BFS traversal of Prisma relations up to N hops
- **Functions:**
  - `traverseGraph({ sourceType, sourceId, maxHops?, nodeTypes? })` — Generic N-hop traversal
  - `getCourseGraphContext(courseId)` — 1-hop traversal from a course (direct children)
  - `searchEntitiesForContext(query)` — Full-text search across all entity types + global context (open tasks, today's routines)
  - `formatGraphContext(graph)` — Converts graph to human-readable markdown for LLM prompts
- **Key Design:** No extra database table — reads from real foreign key relationships
- **Tests:** `__tests__/traversal.test.ts` — Integration tests with real DB

### 7.15 Notes (Second Brain)

The notes system is the most complex feature module with 12+ library files and 31 component files. It implements a full "second brain" with semantic linking, spaced repetition, knowledge gap detection, document management, and annotation support.

#### 7.15.1 Core CRUD (`actions.ts` + `queries.ts` + `validation.ts`)

**Validation Schemas (Zod):**
- `createNoteSchema` — title (optional, max 200), content (required), sourceType, sourceLink, tags, courseId, taskId, projectId, attachments
- `createDocumentNoteSchema` — title (required, max 200), content, folderId, courseId, semesterId, taskId, projectId, documentType, s3Key, s3Url, fileSize, fileName, mimeType, thumbnailUrl, pageCount, originalUrl, embedHtml, tags
- `updateDocumentNoteSchema` — title, content, folderId, courseId, tags, thumbnailUrl
- `documentFiltersSchema` — folderId, courseId, taskId, projectId, type, searchQuery, isFavorite, sortBy, sortOrder, page, pageSize
- `createFolderSchema` — name (max 100), description (max 500), type (FolderType), color, icon, parentId, courseId, semesterId
- `createAnnotationSchema` — type, pageNumber, x, y, width, height, text, color

**Server Actions:**
| Action | Description |
|--------|-------------|
| `createNote(data)` | Creates note with attachments, triggers async `generateSemanticLinks`, revalidates multiple paths |
| `updateNote(id, data)` | Updates note fields, triggers `generateSemanticLinks` if content changed |
| `deleteNote(id)` | Ownership check → deletes S3 files → deletes annotations, attachments, then note |
| `recordNoteView(noteId)` | Increments `viewCount`, updates `lastViewedAt` |
| `reviewNote(noteId)` | Delegates to spaced repetition `markReviewed` |
| `createExplicitLink(sourceId, targetId)` | Creates/explicit link between notes |
| `removeExplicitLink(sourceId, targetId)` | Removes a link |
| `addAttachments(noteId, data)` | Creates attachments with auto-incrementing sortOrder |
| `removeAttachment(id)` | Ownership check → deletes attachment |
| `getFileViewUrl(noteId, attachmentId?, directS3Key?)` | Generates presigned GET URL (1 hour expiry) |

**Queries (React `cache()`-wrapped):**
| Query | Description |
|-------|-------------|
| `getNotes(filters?)` | List notes with optional courseId, folderId, content search |
| `getNoteById(id)` | Single note with course, folder, attachments, annotations |
| `getDocumentLibraryNotes(filters?)` | Notes where `isDocumentLibraryEntry: true` |

#### 7.15.2 Document Library (`actions-documents.ts` + `actions-folders.ts`)

A specialized mode of notes where `isDocumentLibraryEntry: true`. Supports hierarchical folder management.

**Folder Operations:**
| Function | Description |
|----------|-------------|
| `createDocumentFolder(data)` | Validates with Zod, supports nested folders via `parentId` |
| `updateDocumentFolder(id, data)` | Updates folder metadata |
| `deleteDocumentFolder(id)` | Unlinks notes, promotes children to root, then deletes |
| `getDocumentFolders(parentId?)` | Ordered by `isPinned desc, sortOrder asc` with note/child counts |
| `getFolderBreadcrumb(folderId)` | Walks up `parentId` chain to build breadcrumb |
| `moveDocumentFolder(id, newParentId)` | Enforces max depth of 5 levels, prevents self-referencing |
| `createDefaultFolders()` | Creates 6 preset folders: PYQ, Resource Books, Lecture Notes, Assignments, Reference Materials, Projects |

**Document Note Operations:**
| Function | Description |
|----------|-------------|
| `createDocumentNote(data)` | Creates note with `isDocumentLibraryEntry: true` and all document metadata |
| `updateDocumentNote(id, data)` | Updates title, content, folderId, courseId, tags |
| `deleteDocumentNote(id)` | Full cleanup: S3 files → annotations → attachments → note |
| `getDocumentNotes(filters)` | Paginated with folder, course, task, project, type, favorite, text search, sorting |
| `searchDocumentNotes(userId, query)` | Full-text search across title, content, extractedText (up to 50 results) |
| `pinDocumentNote(id, pinned)` | Toggle pin status |
| `favoriteDocumentNote(id, favorite)` | Toggle favorite status |
| `moveDocumentNote(id, newFolderId)` | Move note between folders |

**Folder Types:** PYQ, RESOURCE_BOOK, LECTURE_NOTE, ASSIGNMENT, REFERENCE, PROJECT, GENERAL

#### 7.15.3 Semantic Links (`semantic-links.ts`)

Automatic knowledge graph by linking related notes using **cosine similarity on TF (term frequency) vectors**.

**Algorithm:**
1. `extractKeywords(content)` — Tokenizes, lowercases, strips punctuation, removes ~150 stopwords, filters words < 3 chars, computes TF scores normalized by total word count
2. `calculateSimilarity(kw1, kw2)` — Cosine similarity between two TF vectors (0.0–1.0)
3. `generateSemanticLinks(noteId)` — Compares target note against ALL other user notes, upserts `NoteLink` for similarity ≥ 0.6, cleans up links below threshold

**Functions:**
| Function | Description |
|----------|-------------|
| `generateSemanticLinks(noteId)` | Creates/updates semantic links for a single note |
| `getRelatedNotes(noteId, limit=10)` | Returns deduplicated outgoing + incoming links with scores |
| `createExplicitLink(sourceId, targetId)` | Creates link with `strength: 1.0` (max) |
| `removeLink(sourceId, targetId)` | Deletes link(s) between two notes |
| `regenerateAllLinks(userId)` | Full rebuild — clears all semantic links, recreates for all note pairs |
| `getNoteGraphData(userId, limit=100)` | Returns `{ nodes, edges }` for visualization |

#### 7.15.4 Spaced Repetition (`spaced-repetition.ts`)

SM-2-like review scheduling system.

**Review Intervals:** `[1, 3, 7, 14, 30]` days (indexed by review count, capped at last interval)

**Priority Scoring:**
- Connection count (0–5 pts) — graph hubs reviewed first
- Recency/urgency (0–5 pts) — never-reviewed = max priority
- Reinforcement need (0–3 pts) — fewer reviews = higher priority

**Functions:**
| Function | Description |
|----------|-------------|
| `getNotesForReview(userId, limit=5)` | Fetches due notes, scores by priority, returns top N |
| `markNoteReviewed(noteId)` | Updates `lastReviewedAt`, increments `reviewCount` |
| `getReviewStats(userId)` | Returns totalNotes, notesDueToday, notesReviewedThisWeek, averageReviewCount |
| `resetNoteReview(noteId)` | Resets review history (for content changes) |

#### 7.15.6 Annotations (`actions-annotations.ts` + `annotation-utils.ts`)

Page-level markups on notes and documents.

**Annotation Tools:** highlight, underline, strikeout, note, bookmark

**Highlight Colors:** Yellow (#FFD700), Green (#22C55E), Blue (#3B82F6), Pink (#EC4899), Orange (#F97316)

**Functions:**
| Function | Description |
|----------|-------------|
| `createAnnotation(noteId, data)` | Creates annotation on Note or FileAttachment |
| `updateAnnotation(id, data)` | Updates type, text, color |
| `deleteAnnotation(id)` | Ownership check → deletes |
| `getAnnotations(noteId)` | Fetches by noteId OR fileAttachmentId, ordered by page |
| `groupAnnotationsBy(annotations, groupBy)` | Groups by "page", "type", or "color" |
| `exportAnnotationsAsMarkdown(annotations, title)` | Generates Markdown with title, date, grouped annotations, summary |

#### 7.15.7 Attachments (`actions-attachments.ts`)

File and link attachments for notes.

**Attachment Types:** PDF, IMAGE, VIDEO, AUDIO, DOCUMENT, TEXT, LINK, OTHER

**Functions:**
| Function | Description |
|----------|-------------|
| `addNoteAttachment(noteId, data)` | Auto-increments sortOrder, stores full file metadata |
| `removeNoteAttachment(id)` | Ownership check → deletes |
| `updateNoteAttachment(id, data)` | Updates title and/or sortOrder |
| `addNoteLinkAttachment(noteId, data)` | Creates LINK-type with URL, favicon as thumbnail, description as extractedText |

#### 7.15.9 NLP Parsing (`nlp-parsing.ts` + `actions-nlp.ts`)

AI-powered "Quick Capture" that parses freeform text into structured data.

**System Prompt instructs AI to:**
- Classify as "task" (if deadline mentioned) or "note"
- Extract title (5-8 words), content, due date (relative date interpretation), course name, tags
- Return valid JSON only (no markdown)

**Functions:**
| Function | Description |
|----------|-------------|
| `parseQuickCapture(input, availableCourses)` | OpenRouter with temperature 0.1, maxTokens 512; falls back to plain note on failure |
| `getActiveCourses()` | Queries active semester's courses |
| `parseQuickCaptureAction(input)` | Client-callable wrapper |

#### 7.15.10 DOCX Conversion (`actions-convert.ts`)

Converts Word documents to Markdown.

| Function | Description |
|----------|-------------|
| `convertDocxToMarkdown(noteId)` | Fetches DOCX from S3 → Mammoth converts to HTML → TurndownService converts to Markdown (ATX headings, fenced code blocks) → appends to note content |

#### 7.15.11 Components (31 files)

| Component | Description |
|-----------|-------------|
| `NotesPageClient` | Main notes list page client component |
| `NotesSidebar` | Sidebar with folder navigation and filters |
| `NotesViewToggle` | Toggle between list and grid views |
| `NoteList` | Note card list with metadata |
| `NoteTabs` | Tabbed view for notes |
| `NoteForm` | Create/edit note form |
| `NoteGraphView` | Visual knowledge graph (D3) |
| `EditNoteDialog` | Edit note dialog |
| `MarkdownEditor` | Markdown content editor |
| `QuickCapture` | Quick note/task capture (text + photo modes) |
| `AddLinkDialog` | Dialog for creating note links |
| `LinkList` | List of linked notes |
| `RelatedNotesPanel` | Sidebar showing semantically related notes |
| `ReviewButton` | Trigger spaced repetition review |
| `DocumentCard` | Document library card |
| `DocumentLibrary` | Document library container |
| `DocumentUploadDialog` | Upload documents to library |
| `AttachmentCard` | Attachment display card |
| `AttachmentDropZone` | Drag-and-drop attachment zone |
| `AttachmentProgress` | Upload progress indicator |
| `AttachmentSection` | Attachment list section |
| `AnnotationListSidebar` | Sidebar listing all annotations |
| `AnnotationToolbar` | Toolbar for annotation tools |
| `TextSelectionFloatingBar` | Floating bar on text selection |
| `PdfViewerModal` | Full PDF viewer with annotations |
| `PdfViewerToolbar` | PDF viewer toolbar |
| `PdfThumbnailSidebar` | PDF page thumbnail sidebar |
| `PdfBottomBar` | PDF viewer bottom bar |
| `PdfSearchBar` | PDF text search |
| `FileViewerModal` | Multi-format file viewer |
| `UploadDialog` | Generic upload dialog |

#### 7.15.12 API Routes
| Route | Method | Description |
|-------|--------|-------------|
| `GET /api/notes/graph` | GET | Returns `{ nodes, edges }` for visualization (up to 100 notes) |
| `GET /api/notes/[id]/related` | GET | Returns up to 10 semantically related notes |
| `GET /api/notes/[id]/backlinks` | GET | Returns notes that link TO this note (up to 10) |
| `POST /api/notes/link-metadata` | POST | Fetches Open Graph metadata for a URL |

### 7.16 Notifications
- **Path:** `src/features/notifications/`
- **Components:** `NotificationSettings`, `NotificationTypeToggles`, `DailySummarySettings`
- **Lib:**
  - `scheduler.ts` (1,237 lines) — Full notification scheduling engine with 11 types, timezone-aware scheduling, deduplication via `SentNotification` table, Web Push delivery via VAPID
  - `push-client.ts` (153 lines) — Browser push subscription management (`isPushSupported`, `getPushStatus`, `requestPushSubscription`, `unsubscribePush`)
  - `subscription.ts` — Active subscription queries
- **Actions:** `actions.ts` (preferences CRUD), `subscription.ts` (push subscription management)
- See Section 12 for full notification types.

### 7.18 Projects
- **Path:** `src/features/projects/`
- **Components:** `ProjectList`, `ProjectForm`, `EditProjectDialog`, `MilestoneList`, `MilestoneForm`
- **Lib:** `utils.ts` — `computeProjectProgress(milestones)` = `sum(done weights) / sum(all weights) * 100`
- **Detail Page:** Progress bar, milestones with done/pending, linked tasks, linked notes
- **Actions:** CRUD for projects and milestones

### 7.19 Reviews (AI-Generated Periodic Reviews)
- **Path:** `src/features/reviews/`
- **Components:** `ReviewDetail`, `ReviewList`, `ReviewCard`, `ReviewTypeBadge`, `ReviewTypeFilter`, `ReviewMetricsDisplay`, `ReviewActionsList`, `ReviewExport`, `ReviewPreviewWidget`, `FallbackNotice`
- **Lib:**
  - `generator.ts` — AI review generation with JSON parsing, fallback handling, dedup
  - `prompts.ts` — Type-specific system/user prompts (see below)
  - `data-summary.ts` — Aggregates user data for review context
  - `types.ts` — ReviewSection, ActionItem (kill/automate/focus/unblock/experiment/general), ReviewMetrics

**Review Types & Prompts:**
| Type | Focus | Generated When |
|------|-------|---------------|
| **Daily** | Morning brief: classes, tasks, energy suggestions, 1 insight | Daily at 7:00 AM UTC |
| **Weekly** | Execution snapshot, DRIP matrix, emotional/productivity pattern, identity progress, 5 actions | Sunday |
| **Monthly** | Trend analysis, goal alignment, pattern recognition, strategic pivots | Last day of month |
| **Quarterly** | Vision alignment, identity evolution, anti-vision check, next-quarter priorities | Last day of quarter (Mar/Jun/Sep/Dec) |

**Metrics Displayed:** Tasks completed, completion rate, routine adherence, mood, energy, sleep, spending, attendance, deep work, notes, project progress, identity strength, weekly trends

**Detail Page Features:** Type badge, date range, executive summary (serif pull-quote), collapsible sections (first 3 open by default), categorized action items, metrics display, export, regenerate, fallback handling

### 7.20 Routines
- **Path:** `src/features/routines/`
- **Components:** `RoutineList`, `RoutineForm`, `EditRoutineDialog`, `EnergyMap`
- **Lib:** `streaks.ts` — Merges `RoutineCompletion` + `Task.completedAt` into activity map, computes consecutive day streak (180-day window, cached 60s)
- **Energy Map:** Visual SVG timeline of daily routines with energy impact coloring (green=charging, red=draining, gray=neutral), insight badges (optimal deep work window, energy crash predictions)
- **Actions:** `actions.ts` (CRUD), `actions-completions.ts` (completion toggling)
- **Form Fields:** Name, category, time of day (morning/afternoon/evening/anytime), specific time, active days (SUN-SAT checkboxes), energy impact, identity linking

### 7.21 Schedule
- **Path:** `src/features/schedule/`
- **Components:** `ScheduleGrid`
- **Actions:** Schedule management for weekly recurring class slots

### 7.22 Search
- **Path:** `src/features/search/`
- **Components:** `SearchOverlay` (Cmd+K command palette), `SearchClient` (instant search with debounced input), `SearchResults` (result cards by type)
- **Searches Across:** Notes, tasks, courses, quotes
- **Trigger:** Cmd/Ctrl+K keyboard shortcut from anywhere in the app

### 7.23 Semesters
- **Path:** `src/features/semesters/`
- **Components:** `SemesterForm`, `EditSemesterDialog`
- **Detail Page:** Course list with task/note counts, grade points, SGPA, file management
- **List Page:** Each semester row shows name, ACTIVE badge, credits, course count, date range, SGPA; header shows CGPA across all semesters
- **Actions:** CRUD for semesters

### 7.24 Settings
- **Path:** `src/features/settings/`
- **Components:** `GradingTableEditor`, `AttendanceTableEditor`, `AIProviderSettings`, `GoogleCalendarSettings`, `WidgetAccessSettings`, `NotificationSettings`
- **Sections:**
  1. **Grading & Attendance:** Configurable grade-to-point and attendance-to-marks mappings per course
  2. **Integrations:** AI provider (OpenRouter API key), Google Calendar OAuth, Widget token management
  3. **Notifications:** Push subscription management, per-type toggles (11 types), daily summary config (time, timezone, sections)
- **Actions:** `actions.ts` (delete-and-recreate config tiers, reset to defaults), `queries.ts` (all courses with configs)

### 7.25 Tasks
- **Path:** `src/features/tasks/`
- **Components:** `TaskList`, `TaskForm`, `TaskFilters`, `TaskLinkBadge`, `LinkToPicker`, `EditTaskDialog`

#### Task List (`task-list.tsx`)
- **Architecture:** `useOptimistic` + `useTransition` for instant UI updates
- **Sections:** Open (with count label) and Done (with count label)
- **TaskRow Features:**
  - Checkbox with optimistic toggle
  - Title with `line-through` when done
  - Overdue badge (red, when due date is past)
  - Link badge showing course/project hierarchy
  - Due date display (with time if non-midnight)
  - Priority indicator ("High" in destructive color when priority === 1)
  - Energy requirement badge (lightning bolt for high, green dot for low)
  - Estimated duration (Xm for <60min, Xh for 60+min)
  - Edit button (pencil icon)
  - Star button with optimistic toggle
  - Swipe-to-reveal edit/delete on mobile

#### Task Form (`task-form.tsx`)
- **Desktop:** Flat layout with all fields visible; energy/duration/time behind `<details>` disclosure
- **Mobile:** 2-step wizard (Step 1: title, notes, due date, priority; Step 2: energy, duration, best time, link to)
- **Fields:** Title (required), Notes (optional), Due Date & Time, Priority (1-4), Energy Level, Duration (15min–4hr), Best Time, Link to (course or project)

#### Task Filters (`task-filters.tsx`)
- **Status Tabs:** OPEN (default), DONE, ALL
- **Project Chips:** ALL, NO PROJECT, each project
- **Course Chips:** ALL, each course (horizontally scrollable with fade indicator)
- **Show/Hide Ended Courses** toggle
- **State:** URL search params (shareable, back-button compatible)

#### Link-to Picker (`link-to-picker.tsx`)
- Search across courses (by name/code) and projects (by name)
- Two collapsible sections: Academics and Personal
- "None (Personal inbox)" option
- Mutual exclusivity (selecting course clears project and vice versa)

#### Task Actions
| Action | Description |
|--------|-------------|
| `createTask(data)` | Auto-derives `domainId` from project, attaches userId |
| `updateTask(id, data)` | Manages `completedAt` based on status changes |
| `deleteTask(id)` | Ownership-scoped deletion |
| `toggleTaskDone(id)` | Flips status, sets/clears `completedAt` |
| `toggleTaskStarred(id)` | Toggles `starred` boolean |

**Ownership Model:** Tasks support both user-owned and shared/global (`userId: null`) via `OR: [{ userId }, { userId: null }]` pattern.

### 7.26 Widget (External API)
- **Path:** `src/features/widget/`
- **Lib:**
  - `auth.ts` (77 lines) — SHA-256 token lifecycle: `generateRawToken()`, `generateWidgetToken()`, `verifyWidgetToken()`, `revokeWidgetToken()`, `getActiveWidgetTokenInfo()`
  - `middleware.ts` — `requireWidgetAuth(request)` validates Bearer token, returns 401 JSON on failure
  - `actions.ts` — `generateWidgetTokenAction()`, `revokeWidgetTokenAction()`, `getWidgetTokenStatus()`
- **Purpose:** REST API for external callers (Tasker/KWGT Android widgets)
- See Section 9 for endpoint details.

---

## 8. AI Integration

### OpenRouter Client
- **File:** `src/lib/ai/openrouter.ts`
- **Model:** `openai/gpt-oss-120b` (configurable via `OPENROUTER_MODEL`)
- **Endpoint:** `https://openrouter.ai/api/v1/chat/completions`
- **Headers:** `HTTP-Referer`, `X-Title` for OpenRouter tracking
- **Pattern:** `tryAI()` wrapper — never throws, always returns `AIResult<T>`
- **Availability Check:** `checkAIAvailability()` returns `{ configured, available }`

```typescript
type AIResult<T> = { ok: true; data: T } | { ok: false; error: string };
```

### Features Using AI

| Feature | File | Temperature | Max Tokens | Purpose |
|---------|------|-------------|------------|---------|
| Ask AI | `features/ask/lib/actions.ts` | 0.3 | 1024 | Q&A about academic data using Knowledge Graph context |
| NLP Quick Capture | `features/notes/lib/nlp-parsing.ts` | 0.1 | 512 | Parses freeform text into structured tasks/notes |
| AI Insights | `features/insights/lib/ai-insights.ts` | — | — | Behavioral intelligence analysis |
| Review Generation | `features/reviews/lib/generator.ts` | — | — | Daily/weekly/monthly/quarterly reviews |
| OCR | `features/notes/lib/ocr.ts` | — | — | Tesseract.js (client-side, no AI API) |

### Knowledge Graph Traversal (Context Assembly)
- **File:** `features/knowledge-graph/lib/traversal.ts` (714 lines)
- **Algorithm:** BFS traversal of Prisma relations up to N hops
- **No new database table** — reads from real foreign key relationships
- **Context search:** `searchEntitiesForContext()` searches across all 16 entity types, adds global context (all open tasks, today's routines, active semester courses)
- **Formatting:** `formatGraphContext()` converts graph to human-readable markdown for LLM prompts
- **Merge:** `mergeGraphResults()` deduplicates nodes/edges across multiple traversals

---

## 9. API Routes

### Widget API (4 endpoints)
| Endpoint | Method | Auth | Request | Response |
|----------|--------|------|---------|----------|
| `/api/widget/summary` | GET | Bearer token | — | `{ topTasks[], routines[], upcomingEvents[], streakCount }` |
| `/api/widget/quick-add` | POST | Bearer token | `{ text: string }` | `{ id, title, type: "task"\|"note" }` |
| `/api/widget/tasks/[id]/toggle` | POST | Bearer token | — | `{ id, done: boolean }` |
| `/api/widget/routines/[id]/complete` | POST | Bearer token | — | `{ id, done: true }` |

**Quick-Add Pipeline:** Validates text → gets active courses → NLP parse → creates Task or Note → revalidates paths

**Summary Data:** 3 starred tasks (with course/project badges), up to 5 routines (with completion status), up to 3 events (next 7 days including birthdays), activity streak (180-day lookback)

### Notes API (4 endpoints)
| Endpoint | Method | Auth | Response |
|----------|--------|------|----------|
| `/api/notes/graph` | GET | Supabase session | `{ nodes[], edges[] }` (up to 100 notes) |
| `/api/notes/[id]/related` | GET | Supabase session | Up to 10 related notes with scores |
| `/api/notes/[id]/backlinks` | GET | Supabase session | Up to 10 incoming links with content snippets |
| `/api/notes/link-metadata` | POST | Supabase session | Open Graph metadata (`{ url }` → `{ title, description, image, favicon }`) |

### Cron API (3 endpoints)
| Endpoint | Method | Auth | Schedule | Purpose |
|----------|--------|------|----------|---------|
| `/api/cron/insights` | GET | None | Daily 7:00 AM UTC | Runs rule-based + AI insights + daily morning brief |
| `/api/cron/knowledge-gaps` | GET | None | Daily 3:00 AM UTC | Precomputes knowledge gap detection per user |
| `/api/cron/reviews` | GET | `?secret=` or Bearer | Daily 8:00 PM UTC | Generates weekly (Sunday), monthly (month-end), quarterly (quarter-end) reviews |

### Other API (3 endpoints)
| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/auth/google/callback` | GET | Supabase session | Google Calendar OAuth callback |
| `/api/notifications/trigger` | GET | `CRON_SECRET` | Push notification scheduler trigger (5-min intervals) |
| `/api/attendance/mark-from-push` | POST | Supabase session | Mark attendance from push notification actions |

### Notifications Trigger Details
- **Scheduler:** `runNotificationScheduler()` (1,237 lines)
- **Deduplication:** `SentNotification` table with userId+tag unique constraint, 7-day cleanup
- **Force Mode:** `?force=true` bypasses time window checks
- **Invalid Subscriptions:** Auto-removed on 404/410 responses

---

## 10. Server Actions

All mutations use Next.js Server Actions (`"use server"` functions) instead of REST API routes for the main app.

| Module | File | Key Exports |
|--------|------|-------------|
| Auth | `features/auth/lib/actions.ts` | `login()`, `signup()`, `logout()` |
| Tasks | `features/tasks/lib/actions.ts` | `createTask()`, `updateTask()`, `deleteTask()`, `toggleTaskDone()`, `toggleTaskStarred()`, `getCoursesForPicker()`, `getProjectsForPicker()` |
| Courses | `features/courses/lib/actions.ts` | CRUD for courses |
| Notes | `features/notes/lib/actions.ts` | `createNote()`, `updateNote()`, `deleteNote()`, `recordNoteView()`, `reviewNote()`, `createExplicitLink()`, `removeExplicitLink()`, `addAttachments()`, `removeAttachment()`, `getFileViewUrl()` |
| Notes OCR | `features/notes/lib/actions-ocr.ts` | `processOcrAction()` |
| Notes NLP | `features/notes/lib/actions-nlp.ts` | `parseQuickCaptureAction()`, `getActiveCoursesAction()` |
| Notes Documents | `features/notes/lib/actions-documents.ts` | `createDocumentFolder()`, `updateDocumentFolder()`, `deleteDocumentFolder()`, `getDocumentFolders()`, `moveDocumentFolder()`, `createDocumentNote()`, `updateDocumentNote()`, `deleteDocumentNote()`, `getDocumentNotes()`, `searchDocumentNotes()`, `pinDocumentNote()`, `favoriteDocumentNote()`, `moveDocumentNote()` |
| Notes Folders | `features/notes/lib/actions-folders.ts` | `createDefaultFolders()`, `createFolder()`, `updateFolder()`, `deleteFolder()`, `getFolders()`, `reorderFolders()` |
| Notes Annotations | `features/notes/lib/actions-annotations.ts` | `createAnnotation()`, `updateAnnotation()`, `deleteAnnotation()`, `getAnnotations()` |
| Notes Attachments | `features/notes/lib/actions-attachments.ts` | `addNoteAttachment()`, `removeNoteAttachment()`, `updateNoteAttachment()`, `addNoteLinkAttachment()`, `getNoteAttachments()` |
| Notes Convert | `features/notes/lib/actions-convert.ts` | `convertDocxToMarkdown()` |
| Projects | `features/projects/lib/actions.ts` | CRUD for projects and milestones |
| Budget | `features/budget/lib/actions.ts` | CRUD for budget entries |
| People | `features/people/lib/actions.ts` | CRUD for people |
| Library | `features/library/lib/actions.ts` | CRUD for resources and quotes |
| Semesters | `features/semesters/lib/actions.ts` | CRUD for semesters |
| Routines | `features/routines/lib/actions.ts` | CRUD for routines |
| Routines | `features/routines/lib/actions-completions.ts` | Routine completion toggling |
| Domains | `features/domains/lib/actions.ts` | CRUD for domains |
| Assessments | `features/assessments/lib/actions.ts` | CRUD for assessments |
| Attendance | `features/attendance/lib/actions.ts` | Attendance marking |
| Schedule | `features/schedule/lib/actions.ts` | Schedule management |
| Calendar | `features/calendar/lib/google-actions.ts` | Google Calendar connection/disconnection |
| Settings | `features/settings/lib/actions.ts` | `updateGradingConfig()`, `updateAttendanceMarksConfig()`, `resetGradingToDefaults()`, `resetAttendanceToDefaults()` |
| Ask | `features/ask/lib/actions.ts` | `askQuestion()` |
| Search | `features/search/lib/actions.ts` | `searchAction()` |
| Widget | `features/widget/lib/actions.ts` | `generateWidgetTokenAction()`, `revokeWidgetTokenAction()`, `getWidgetTokenStatus()` |
| Notifications | `features/notifications/lib/actions.ts` | Notification preference CRUD |
| Notifications | `features/notifications/lib/subscription.ts` | Push subscription management |
| Files | `lib/s3/actions.ts` | `uploadFile()`, `deleteFile()`, `getFileMetadata()`, `listFiles()`, `getPresignedUploadUrl()` |

---

## 11. PWA Features

### Manifest
- **File:** `public/manifest.json`
- **Name:** "Academic Command Center"
- **Display:** standalone
- **Orientation:** portrait-primary
- **Categories:** education, productivity
- **Start URL:** `/today`
- **Theme:** `#1A1A1A` (dark), Background `#FAF8F5` (warm off-white)
- **Icons:** 8 sizes (72, 96, 128, 144, 152, 192, 384, 512px) — generated via `scripts/generate-icons.js` using Sharp from SVG graduation cap

### Service Worker (`public/sw.js` — 269 lines)

**Caching Strategy:**
| Resource | Strategy | Cache Name |
|----------|----------|------------|
| Static assets (`/_next/static/`, `.js`, `.css`, `.woff2`) | Cache-first | `app-shell-v1` |
| API requests (`/api/`) | Network-first with cache fallback | `data-cache-v1` |
| Navigation requests | Network-first with fallback to `/offline.html` | — |

**Skipped Requests:** HMR, RSC streaming, prefetch requests

**Push Handling:** Parses JSON push data, shows notification with vibration pattern

**Notification Actions:**
- `mark_present` / `mark_absent` — Calls `/api/attendance/mark-from-push` to mark attendance directly from notification
- Opens relevant page on notification click

### Components
- `ServiceWorkerRegistration` — Registers SW in root layout (production only; unregisters stale SWs in development)
- `OfflineBanner` — Fixed top banner when network is unavailable, dismissible

### Icon Generation
- **Script:** `scripts/generate-icons.js`
- **Tool:** Sharp image processing library
- **Source:** SVG graduation cap
- **Sizes:** 72, 96, 128, 144, 152, 192, 384, 512px

---

## 12. Push Notifications

### Scheduler (1,237 lines)
**File:** `src/features/notifications/lib/scheduler.ts`

| Notification Type | Timing | Description |
|-------------------|--------|-------------|
| `routine_reminder` | At routine's specific time or time-of-day default | Reminds to complete routine |
| `task_due` | 09:00 for tasks due today/tomorrow | Upcoming task deadlines |
| `class_start` | 20 minutes before class | Upcoming class alert |
| `class_end` | 0-20 minutes after class end | Attendance action buttons (mark present/absent) |
| `assessment` | 09:00 for assessments due today/tomorrow | Assessment deadlines |
| `daily_summary` | At user's preferred time (configurable) | Configurable sections: classes, tasks, routines, deadlines, attendance, tomorrow_classes |
| `missed_routine` | 21:00 for incomplete routines | Routines not completed today |
| `overdue_task` | 10:00 for past-due tasks | Tasks past due date |
| `review_daily` | At appropriate time | Daily review available |
| `review_weekly` | At appropriate time | Weekly review available |
| `review_monthly` | At appropriate time | Monthly review available |

### Client (`push-client.ts` — 153 lines)
- `isPushSupported()` — Checks browser Push API support
- `getPushStatus()` — Returns supported/subscribed/permission status
- `requestPushSubscription()` — Requests permission, registers SW, subscribes with VAPID key, stores subscription server-side
- `unsubscribePush()` — Unsubscribes and removes server-side

### Preferences
- Per-user notification type toggles (11 types)
- Daily summary configuration: time, timezone, included sections (classes, tasks, routines, deadlines, attendance, tomorrow_classes)
- **Model:** `NotificationPreference` in database

### Deduplication
- `SentNotification` table with userId+tag unique constraint
- 7-day cleanup of old sent notification records
- Prevents duplicate notifications within the same day

### Trigger
- **Endpoint:** `GET /api/notifications/trigger?secret=CRON_SECRET`
- **Interval:** External cron service every 5 minutes
- **Auth:** `CRON_SECRET` via query param or Bearer header
- **Force Mode:** `?force=true` bypasses time window checks

---

## 13. External Integrations

### Google Calendar
- **Scope:** Read-only (`calendar.readonly`)
- **Calendars:** Primary calendar + Birthdays calendar
- **Features:** OAuth 2.0 flow, automatic token refresh, birthday detection (by calendar source pattern + title pattern matching "'s birthday")
- **File:** `src/features/calendar/lib/google-calendar.ts` (358 lines)
- **Storage:** `GoogleCalendarToken` model (access/refresh tokens per user)
- **Connection Check:** `isGoogleCalendarConnected(userId)` with 5-minute cache

### External Widget API (Tasker/KWGT)
- **Purpose:** REST API for Android widgets
- **Auth:** Bearer token (SHA-256 hashed, single active token)
- **Endpoints:** Summary, quick-add (NLP), task toggle, routine completion
- **Token lifecycle:** Generate → show raw once → hash and store → verify on each request → revoke
- **Settings UI:** Generate/revoke buttons, last-used timestamp display

### Object Storage (S3/MinIO)
- **Client:** `src/lib/s3/client.ts` — Singleton S3Client with globalThis pattern
- **Config:** MinIO on local network (`http://192.168.101.10:9004`)
- **Functions:**
  - `getPresignedUrl(key, expiresIn?)` — Presigned GET URL (default 1 hour)
  - `getUploadUrl(key, contentType, expiresIn?)` — Presigned PUT URL (default 15 min)
  - `getPublicUrl(key)` — Constructs public URL
  - `tryS3(fn, context)` — Error-handling wrapper with categorized errors
- **Server Actions:** `uploadFile()`, `deleteFile()`, `getFileMetadata()`, `listFiles()`, `getPresignedUploadUrl()`
- **File Types Allowed:** pdf, jpg, jpeg, png, gif, webp, mp4, mp3, doc, docx, txt, md
- **Blocked Extensions:** 21 blocked (exe, js, html, svg, bat, cmd, sh, etc.)
- **Size Limits:** PDF 50MB, IMAGE 10MB, VIDEO 100MB, AUDIO 50MB, DOCUMENT 20MB, TEXT 5MB
- **User Scoping:** Files stored under user-specific prefixes

### Embedding Service (Planned)
- **Status:** Commented out in `.env`
- **Provider:** Hugging Face
- **Endpoint:** `HF_EMBEDDING_ENDPOINT_URL`
- **Model:** `sentence-transformers/all-MiniLM-L6-v2`
- **Purpose:** Likely planned for semantic search or vector-based knowledge retrieval

---

## 14. State Management

### No External State Library
No Redux, Zustand, Jotai, Recoil, or React Context is used anywhere in the application.

### Data Flow
1. **Server Components (default)** — Async components fetch data directly via Prisma
2. **Server Actions** — All mutations use `"use server"` functions
3. **URL Search Params** — Filtering state managed via URL (`status`, `project`, `course`, `userId`, `showEnded` params)
4. **React `cache()`** — Request-level deduplication (e.g., `getDashboardData`, all query functions)
5. **In-Memory Cache (`MemCache`)** — TTL-based singleton on `globalThis`
6. **`useOptimistic`** — Instant UI updates for task/routine toggles
7. **`useTransition`** — Non-blocking server action calls

### Cache TTLs
| Data | TTL | Constant |
|------|-----|----------|
| Grading Configs | 10 minutes | `TTL.CONFIG` |
| Semesters | 5 minutes | `TTL.SEMESTER` |
| Dashboard | 60 seconds | `TTL.DASHBOARD` |
| Auth (userId) | 5 minutes | `TTL.AUTH` |
| Activity Streak | 60 seconds | — |
| Google Calendar Connected | 5 minutes | — |
| AI Insights (rule-based) | 1 hour | — |
| AI Insights (AI-generated) | 24 hours | — |

### Cache Implementation
```typescript
// src/lib/mem-cache.ts
class MemCache {
  get<T>(key: string, ttlMs: number, fn: () => T): T
  invalidate(key: string): void
  invalidatePrefix(prefix: string): void
  invalidateAll(): void
}
export const memCache = globalForCache.__memCache ?? new MemCache();
```

### Cache Invalidation
- `revalidatePath()` after all mutations
- `revalidate = 0` on pages requiring fresh data (dashboard, settings, tasks, notes)
- `revalidateTag()` not used (relies on path-based invalidation)

### Client State
- Local `useState` in client components for UI state (dialog open/close, form inputs, loading, mobile step)
- No global client state — all data comes from server components
- URL params for filter state (shareable, back-button compatible)

---

## 15. Testing

### Framework
- **Tool:** Vitest ^4.1.10
- **Config:** `vitest.config.ts`
- **Environment:** Node
- **Pattern:** `src/**/*.test.ts`
- **Globals:** Enabled
- **Path Alias:** `@` → `./src`

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
- **Ignores:** `.next/`, `out/`, `build/`, `next-env.d.ts`
- **Command:** `npm run lint`

---

## 16. Deployment

### Platform
Google Cloud Run (`Dockerfile` and `cloudbuild.yaml`)

### Configuration
- **Build:** `next build` (standalone output)
- **Post-install:** `prisma generate` (auto-generates Prisma client)
- **Runtime:** Node.js (explicitly set for cron routes)
- **Server External Packages:** `googleapis`, `pg`, `@prisma/client`, `@prisma/adapter-pg`, `prisma`, `web-push`

### Seed
```bash
npx tsx prisma/seed.ts  # Seeds 30 motivational quotes (idempotent)
```

---

## 17. Key Libraries

### Production Dependencies (30 packages)

| Library | Version | Purpose |
|---------|---------|---------|
| `next` | 16.2.10 | React framework (App Router) |
| `react` / `react-dom` | 19.2.4 | UI library |
| `@prisma/client` | ^7.8.0 | Prisma ORM client |
| `@prisma/adapter-pg` | ^7.8.0 | PostgreSQL driver adapter (library engine) |
| `prisma` | ^7.8.0 | Prisma CLI |
| `pg` | ^8.22.0 | Raw PostgreSQL client |
| `@supabase/ssr` | ^0.12.0 | Supabase SSR helpers |
| `@supabase/supabase-js` | ^2.110.0 | Supabase client |
| `@aws-sdk/client-s3` | ^3.1085.0 | S3/MinIO object storage |
| `@aws-sdk/s3-request-presigner` | ^3.1085.0 | S3 presigned URLs |
| `@base-ui/react` | ^1.6.0 | Base UI primitives |
| `class-variance-authority` | ^0.7.1 | Component variant utility (CVA) |
| `clsx` | ^2.1.1 | Conditional class names |
| `tailwind-merge` | ^3.6.0 | Tailwind class deduplication |
| `tw-animate-css` | ^1.4.0 | Tailwind animation utilities |
| `framer-motion` | ^12.42.2 | React animations |
| `lucide-react` | ^1.23.0 | Icon library |
| `date-fns` | ^4.4.0 | Date manipulation |
| `d3` | ^7.9.0 | Data visualization (knowledge graph) |
| `googleapis` | ^173.0.0 | Google Calendar API |
| `web-push` | ^3.6.7 | Web Push notifications (VAPID) |
| `tesseract.js` | ^7.0.0 | Client-side OCR |
| `react-day-picker` | ^10.0.1 | Calendar/date picker component |
| `react-pdf` | ^10.4.1 | PDF rendering |
| `react-pdf-highlighter-extended` | ^8.1.0 | PDF annotation/highlighting |
| `react-markdown` | ^10.1.0 | Markdown rendering |
| `sonner` | ^2.0.7 | Toast notifications |
| `next-themes` | ^0.4.6 | Theme switching (dark/light) |
| `mammoth` | ^1.12.0 | DOCX to HTML conversion |
| `turndown` | ^7.2.4 | HTML to Markdown conversion |
| `zod` | ^4.4.3 | Schema validation |
| `shadcn` | ^4.13.0 | shadcn CLI |

### Dev Dependencies (10 packages)

| Library | Version | Purpose |
|---------|---------|---------|
| `typescript` | ^5 | TypeScript compiler |
| `@tailwindcss/postcss` | ^4 | Tailwind PostCSS plugin (v4) |
| `tailwindcss` | ^4 | Tailwind CSS |
| `eslint` | ^9 | Linter |
| `eslint-config-next` | 16.2.10 | Next.js ESLint config |
| `vitest` | ^4.1.10 | Test framework |
| `dotenv` | ^17.4.2 | Environment variable loading |
| `tsx` | ^4.19.0 | TypeScript execution (seed script) |
| `@types/node` | ^20 | Node.js type definitions |
| `@types/pg` | ^8.20.0 | PostgreSQL type definitions |
| `@types/react` | ^19 | React type definitions |
| `@types/react-dom` | ^19 | React DOM type definitions |
| `@types/d3` | ^7.4.3 | D3 type definitions |
| `@types/web-push` | ^3.6.4 | Web Push type definitions |
| `@types/turndown` | ^5.0.6 | Turndown type definitions |

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

### Shared Types (`src/types/index.ts` — 353 lines)

#### Academic Types
| Type | Description |
|------|-------------|
| `SemesterWithCourses` | Semester with nested courses array |
| `CourseWithDetails` | Course with schedules, attendance, assessments, tasks, notes, configs |
| `CourseSummary` | Course with task/note counts |

#### Task & Note Types
| Type | Description |
|------|-------------|
| `TaskWithCourse` | Task with optional course and project picks |
| `NoteWithCourse` | Note with optional course, folder, noteAttachments |
| `NoteWithAnnotations` | NoteWithCourse + annotations array |
| `NoteWithAttachments` | NoteWithCourse + noteAttachments |
| `NoteWithScore` | Search result note with relevance score, linkType, contextSnippet |
| `NoteWithLinks` | Knowledge graph note with outgoingLinks, incomingLinks, _count |

#### Dashboard Types
| Type | Description |
|------|-------------|
| `DashboardData` | Full dashboard payload: topTasks, allOpenTasks, todayClasses, upcomingDeadlines, attendanceAlerts, routines, streakData, quotes, activeProjects, sgpa, cgpa, latestReview, knowledgeStats, reviewStats |
| `CalendarEvent` | Merged calendar view (classes, assessments, tasks, events) |
| `GradeResult` | Grading computation result (gradePoint, sgpa, cgpa, attendanceMarks, attendancePercent) |
| `DailySummarySection` | Union: "classes" \| "tasks" \| "routines" \| "deadlines" \| "attendance" \| "tomorrow_classes" |

#### Knowledge Graph Types
| Type | Description |
|------|-------------|
| `GraphNodeType` | Union of 16 entity types |
| `GraphNode` | `{ id, type, data }` |
| `GraphEdge` | `{ source, target, relation }` |
| `GraphResult` | `{ nodes: GraphNode[], edges: GraphEdge[] }` |

#### Second Brain Types
| Type | Description |
|------|-------------|
| `KnowledgeGap` | `{ type, description, relatedNoteIds[], suggestedTopics[], severity }` |
| `KnowledgeStats` | `{ noteCount, connectionCount, gapCount, reviewsDue, topClusters[] }` |
| `NoteGraphNode` | `{ id, label, courseName, courseColor, connectionCount, lastReviewedAt }` |
| `NoteGraphEdge` | `{ source, target, strength, linkType }` |
| `NoteGraphData` | `{ nodes: NoteGraphNode[], edges: NoteGraphEdge[] }` |

#### Document Library Types
| Type | Description |
|------|-------------|
| `DocumentFolderWithCount` | DocumentFolder with note/child counts |
| `NoteWithDocumentInfo` | Note with course, folder, task, project, attachments, _count |
| `AttachmentInput` | Attachment creation input (type, title, s3Key, s3Url, fileSize, etc.) |
| `CreateDocumentNoteInput` | Full document note creation input |
| `UpdateDocumentNoteInput` | Partial document note update input |
| `DocumentFilters` | Filter/pagination params for document queries |

#### Insight Types
| Type | Description |
|------|-------------|
| `InsightEvidence` | `{ metric, value, threshold, context }` |
| `InsightInput` | `{ userId, type, title, description, severity, evidence[] }` |

---

## 20. Layout Architecture

### Root Layout (`src/app/layout.tsx`)
- Loads 3 fonts: Geist Sans, Geist Mono, Playfair Display
- Sets `<html>` font CSS variables + `h-full antialiased`
- Sets `<body>` with `min-h-full flex flex-col`
- Renders `<Toaster />` (Sonner) and `<ServiceWorkerRegistration />` (PWA)
- Viewport: `themeColor: "#1A1A1A"`, `maximumScale: 1` (prevents zoom on mobile)

### App Shell (`src/app/(app)/layout.tsx`)
```
<div class="min-h-screen bg-background">
  <OfflineBanner />           ← Fixed top offline indicator
  <SearchOverlay />           ← Global Cmd+K search palette
  <Sidebar />                 ← Desktop left sidebar (w-64)
  <main class="lg:pl-64">
    <OverdueBanner />         ← Server component, overdue task count
    <div class="max-w-5xl mx-auto">
      <PageTransition>        ← Framer Motion 80ms opacity fade
        {children}
      </PageTransition>
    </div>
  </main>
  <MobileTabs />              ← Fixed bottom tab bar (mobile only)
  <FabCluster />              ← Floating action button (bottom-right)
</div>
```

### Sidebar (`src/components/layout/sidebar.tsx`)
- **Desktop only** (hidden on mobile)
- **Width:** w-64 (16rem)
- **Nav Items (13):** Today, Tasks, Calendar, Reviews, Semesters, Routines, Notes, Projects, Budget, People, Library, Search, Ask
- **Bottom Section:** Search trigger (Cmd+K), Settings, Sign Out (form action)
- **Active State:** `.sidebar-link-active` class with accent background
- **Cmd+K:** Clicking Search opens the SearchOverlay

### Mobile Tabs (`src/components/layout/mobile-tabs.tsx`)
- **Mobile only** (hidden on desktop)
- **Fixed bottom** with safe-area-inset-bottom padding
- **4 Main Tabs:** Today, Tasks, Calendar, Ask
- **More Tab:** Opens `<MobileNavSheet>` with remaining features
- **Safe Area:** Respects notched devices

### Mobile Nav Sheet (`src/components/layout/mobile-nav-sheet.tsx`)
- **Bottom sheet** triggered by "More" tab
- **3 Sections:**
  - Academics: Reviews, Semesters, Routines, Notes
  - Manage: Projects, Budget, People, Library
  - System: Search, Settings

### FAB Cluster (`src/components/layout/fab-cluster.tsx`)
- **Position:** Fixed bottom-right (above mobile tabs on mobile)
- **Opens a tabbed dialog** with 3 quick-add options:
  - **Task Tab:** Title, due date, priority, LinkToPicker (courses/projects). Mobile: 2-step wizard.
  - **Note Tab:** Text mode (with AI parse via `parseQuickCaptureAction`) or Photo mode (OCR via `processOcrAction`)
  - **Budget Tab:** Type (income/expense), amount, category, date, notes

### Overdue Banner (`src/components/layout/overdue-banner.tsx`)
- **Server component** — counts open tasks with past due dates
- **Shows:** Red banner with count and link to `/tasks`
- **Conditionally rendered** — only when overdue tasks exist

---

## 21. Shared Components

### Layout Components (`src/components/layout/`)
| Component | Description |
|-----------|-------------|
| `Sidebar` | Desktop left sidebar with 13 nav items, search, settings, sign out |
| `MobileTabs` | Fixed bottom tab bar with 4 tabs + More |
| `MobileNavSheet` | Bottom sheet with categorized navigation links |
| `FabCluster` | Floating action button with tabbed quick-add dialog |
| `OverdueBanner` | Server-rendered overdue task count warning |

### Shared Components (`src/components/shared/`)
| Component | Description |
|-----------|-------------|
| `PageHeader` | Reusable page header with title, subtitle, optional back arrow link, optional action slot |
| `PageTransition` | Framer Motion `<motion.div>` with 80ms opacity fade keyed on pathname |
| `EmptyState` | Centered empty state with title, description, optional action slot |
| `LoadingSkeleton` | Pulsing skeleton with heading and content lines |
| `SwipeToReveal` | Touch swipe: left reveals Edit (blue), right reveals Delete (red); snap-to-open, click-outside/escape-to-close |
| `OfflineBanner` | Client component, listens to online/offline events, shows dismissible banner |
| `ServiceWorkerRegistration` | Registers `/sw.js` in production; unregisters stale SWs in development |
| `LinkedNotesSection` | Shows document attachments for a task/project, supports upload dialog and file viewer modal |

### UI Primitives (`src/components/ui/`)
| Component | Base | Features |
|-----------|------|----------|
| `Button` | `@base-ui/react/button` + CVA | 6 variants (default, outline, secondary, ghost, destructive, link), 8 sizes (default, xs, sm, lg, icon, icon-xs, icon-sm, icon-lg) |
| `Dialog` | `@base-ui/react/dialog` | Dialog, DialogTrigger, DialogPortal, DialogClose, DialogOverlay, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription |
| `Sheet` | `@base-ui/react/dialog` | Slide-over panel, 4 sides (top/right/bottom/left) |
| `Sonner` | `sonner` + `next-themes` | Toast notifications with custom icons (success/info/warning/error/loading) |
| `ContextMenu` | Custom | Right-click menu with items (label, icon, onClick, destructive, disabled) |

---

## 22. Upload System

### DropZone (`src/components/upload/DropZone.tsx`)
- Drag-and-drop zone with file validation
- Checks blocked extensions (21 blocked types) and size limits per file type
- Shows drag-active state and error messages
- Accepts multiple files

### FileUploader (`src/components/upload/FileUploader.tsx`)
- Orchestrates multi-file uploads
- Gets presigned URLs via `getPresignedUploadUrl`
- Uploads via XHR with progress tracking (speed, percentage)
- Supports cancel and retry per file

### UploadProgress (`src/components/upload/UploadProgress.tsx`)
- Per-file upload progress card
- Shows: status icon, file name/size, progress bar, speed/ETA, success/error states
- Cancel and retry buttons per file

---

## 23. Configuration Files

| File | Purpose |
|------|---------|
| `next.config.ts` | Next.js config — marks `googleapis`, `pg`, `@prisma/client`, `@prisma/adapter-pg`, `prisma`, `tesseract.js`, `web-push` as server external packages |
| `tsconfig.json` | TypeScript — ES2017 target, strict mode, `@/*` path alias, bundler module resolution, Next.js plugin |
| `postcss.config.mjs` | PostCSS with `@tailwindcss/postcss` plugin (Tailwind v4) |
| `eslint.config.mjs` | ESLint flat config — core-web-vitals + TypeScript |
| `vitest.config.ts` | Vitest — node env, `src/**/*.test.ts`, globals enabled, `@` alias |
| `components.json` | shadcn/ui — base-nova style, lucide icons, CSS variables, RSC enabled |
| `prisma.config.ts` | Prisma — schema path, migrations, datasource URL (DATABASE_URL + DIRECT_URL) |
| `.env` / `.env.local` / `.env.production` | Environment variables (Supabase, OpenRouter, Google, VAPID, S3) |
| `public/manifest.json` | PWA manifest — "Academic Command Center", standalone, portrait |
| `.gitignore` | Ignores node_modules, .next, .env*, build artifacts |
| `package.json` | Scripts: dev, build, start, lint, test, test:watch, postinstall (prisma generate) |
| `next-env.d.ts` | Next.js TypeScript declarations (auto-generated) |

---

## 24. Environment Variables

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable (anon) key |
| `DATABASE_URL` | PostgreSQL connection string (pooled, port 6543) |
| `DIRECT_URL` | PostgreSQL direct connection (port 5432, for migrations) |
| `OPENROUTER_API_KEY` | OpenRouter AI API key |
| `OPENROUTER_MODEL` | AI model (default: `openai/gpt-oss-120b`) |
| `GOOGLE_CALENDAR_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CALENDAR_CLIENT_SECRET` | Google OAuth client secret |
| `GOOGLE_CALENDAR_REDIRECT_URI` | Google OAuth callback URL |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Web Push VAPID public key |
| `VAPID_PRIVATE_KEY` | Web Push VAPID private key |
| `VAPID_EMAIL` | VAPID contact email |
| `S3_ENDPOINT` | MinIO/S3 endpoint URL |
| `S3_PUBLIC_ENDPOINT` | Public-facing S3 endpoint |
| `S3_REGION` | S3 region |
| `S3_FORCE_PATH_STYLE` | Path-style S3 access (MinIO requires this) |
| `S3_ACCESS_KEY_ID` | S3 access key |
| `S3_SECRET_ACCESS_KEY` | S3 secret key |
| `S3_BUCKET` | S3 bucket name |
| `CRON_SECRET` | Secret for cron endpoint authentication |
| `HF_EMBEDDING_ENDPOINT_URL` | Hugging Face embedding endpoint (planned) |
| `HF_API_TOKEN` | Hugging Face API token (planned) |
| `HF_EMBEDDING_MODEL` | Hugging Face embedding model (planned) |

---

## 25. Statistics

| Category | Count |
|----------|-------|
| React Components | ~100+ |
| Pages/Routes | 21 |
| API Endpoints | 14 |
| Server Action Modules | ~30 |
| Database Models | 28 |
| Prisma Enums | 20 |
| Feature Modules | 26 |
| Custom Utility Modules | ~20 |
| PWA Icon Sizes | 8 |
| Notification Types | 11 |
| Knowledge Graph Entity Types | 16 |
| Insight Detectors | 10 |
| Review Types | 4 |
| Annotation Tools | 5 |
| Attachment Types | 8 |
| Folder Types | 7 |
| CSS Design System Classes | 6 |
| Environment Variables | 24 |
| Production Dependencies | 30+ |
| Dev Dependencies | 15+ |

---

*Generated from codebase analysis on 2026-08-07.*
