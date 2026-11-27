# Mobile Shell & Reliability Audit (`360x800` and `390x844`)

Date: 2026-11-27
Branch: `phase-8-mobile-shell` (branched from `phase-7b-calendar-display` `45ce67d`)

## Screenshot & Browser Capture Status

- `npx --yes playwright install chromium` succeeded (installed `chromium_headless_shell-1255` ad hoc without modifying `package.json`).
- **Why live authenticated screenshots were not captured:** Authenticated `(app)` routes invoke server components (`AppLayout` → `getDashboardLayout()`, `TodayPage` → `getDsaDueSummary` / `getLatestDailyBriefs`, etc.) that call `prisma` directly against the shared PostgreSQL database. Per `AGENTS.md` and Phase 8 rules ("do not connect to any database"), no live database server or seeded DB session was started, and no fake-auth RSC bypass exists in the app. Therefore, every route in the build route table was audited by inspecting `src/app/layout.tsx`, `src/app/(app)/layout.tsx`, `src/components/layout/*`, and the route/feature components.

---

## Ranked Issues (By Owner Frequency)

| Rank | Severity | Area / Route(s) | Issue | Fix Target |
| --- | --- | --- | --- | --- |
| 1 | High | Global Mobile Shell (`src/components/layout/mobile-tabs.tsx`, `src/app/(app)/more/page.tsx`) | Bottom nav has `Today, Tasks, Calendar, Ask, More` instead of `Today, Tasks, Calendar, Notes, More`; `More` opens a `75vh` sheet (`h-[75vh]`) rather than navigating cleanly or matching the grouped `Study / Tools / Settings` structure; `/more` page is missing `Reviews`, `Ask`, `Search` | Item 2 |
| 2 | High | Global Viewport & Safe Areas (`src/app/layout.tsx`, `src/app/(app)/layout.tsx`, `src/app/globals.css`, sheets/modals) | `viewport` in `src/app/layout.tsx` is missing `viewportFit: "cover"`; `h-[75vh]`, `h-screen`, `100vh` used instead of `dvh`; sheets/modals lack `env(safe-area-inset-bottom)` padding; `FabCluster` and forms lack keyboard-safe scroll-into-view | Item 3 |
| 3 | High | `/calendar` (`calendar-view.tsx`, `mobile-calendar-view.tsx`) | Two separate calendar implementations (`calendar-view.tsx` 1654 lines + `mobile-calendar-view.tsx` 528 lines) with duplicated headers, view switchers, and divergent toolbar/detail behaviors (`MobileCalendarView` lacks `Add Event` button in header, uses small `px-2 py-1` targets < 44px) | Item 4 |
| 4 | High | `/notes`, `/notes/[id]`, `/courses/[id]` (`PdfViewerModal.tsx`, `src/lib/pdf/setup.ts`) | `PdfViewerModal.tsx` hardcodes `workerSrc="https://unpkg.com/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs"` (CDN, fails offline, version mismatch with `react-pdf` `10.4.1` which bundles `pdfjs-dist` 5.x); renders all pages at once (OOM risk on 100-page PDFs); loads `react-pdf-highlighter-extended` on mobile too | Item 5 |
| 5 | High | Global Sync & Offline Feedback (`src/lib/sync/provider.tsx`, `src/lib/sync/sync-manager.ts`, `sidebar.tsx`) | Mobile header has no sync indicator; `SyncProvider` exposes `isSyncing` / `pullAll` only in desktop `Sidebar`; failed dirty-queue pushes are not surfaced in a mobile sheet with retry/backoff | Item 7 |
| 6 | Medium | `/notes`, `/semesters/[id]`, `/courses/[id]` (`FileUploadDialog.tsx`, `DocumentUploadDialog.tsx`, `UploadDialog.tsx`) | Duplicate upload dialogs (`FileUploadDialog` vs `DocumentUploadDialog`); no `/api/health/storage` readiness check; Notes Files chip does not surface `"Files are unavailable: storage offline"` when S3 is unreachable | Item 6 |
| 7 | Medium | All routes (`src/app/**`) | Only `src/app/(app)/loading.tsx` and `src/app/(app)/settings/error.tsx` exist; missing `app/error.tsx`, `app/global-error.tsx`, `app/not-found.tsx`, and route-level `error.tsx` boundaries | Item 8 |
| 8 | Medium | Bundle Size / Cold Start (`/notes`, `/notes/graph`, `/calendar`, `/dsa`) | Heavy libs (`react-pdf`, `react-pdf-highlighter-extended`, `d3`/graph, markdown editor) are statically imported in page/client bundles | Item 9 |
| 9 | Low | PWA (`public/manifest.json`, `public/sw.js`, `src/app/layout.tsx`) | Manifest lacks `shortcuts` (Today, Brief, Capture, DSA log), `categories`, and install hint (`beforeinstallprompt`); `theme_color` / `background_color` should match editorial tokens; offline fallback page needs clear offline-capability summary | Item 10 |
| 10 | Low | Accessibility across components | Icon-only buttons missing `aria-label` in several dialogs/toolbars; `prefers-reduced-motion` not consistently applied | Item 11 |

---

## Route-by-Route Audit (`360x800` and `390x844`)

| Route | Overflow Risk | Tap Targets < 44px | Text < 14px | Dialogs / Fixed Overlaps / Keyboard | Loading / Empty / Error States |
| --- | --- | --- | --- | --- | --- |
| `/today` | Low (`TodayDashboard` stacks cleanly; `BriefTodayCard` wraps) | `Add semester` / widget buttons mostly 44px; some compact links | `section-label` / metadata 11–12px (intentional labels); body 14px | `FabCluster` bottom-right (`bottom-20`) near bottom nav; `FabCluster` dialog uses `Dialog` instead of mobile bottom sheet | `TodayPageClient` skeleton ok; missing route `error.tsx` |
| `/brief` | Low (single-column cards) | Quick-action chips ok (`min-h-[44px]`) | Weather sub-metrics 12px | None | Has `EmptyState`; missing route `error.tsx` |
| `/tasks` | Low | Filter chips & checkbox rows (`min-h-[44px]` on most, verify inline edit buttons) | Metadata badges 11–12px | Task edit dialog opens centered instead of bottom sheet on mobile; keyboard can cover bottom inputs | Has `EmptyState`; missing route `error.tsx` |
| `/calendar` | Medium (desktop `WeekView` uses `calc(100vh - 220px)`, `MobileCalendarView` uses `h-[calc(100vh-140px)]`) | Mobile toolbar `Today` (`px-2 py-1`), view switcher (`px-2 py-1`), and `Acad` (`px-2 py-1`) are ~28px tall (< 44px) | All-day labels 11–12px | `EventDetailModal` and `EventCreationDialog` are centered modals on mobile; `MobileCalendarView` duplicates `CalendarView` | No `loading` skeleton in `DayDetailPanel`; offline academic banner added in Phase 7b |
| `/notes` | Medium (`NotesSidebar` + `DocumentLibrary` grid) | Filter/view icon buttons < 44px; `PdfViewerModal` toolbar buttons small on 360px | Card metadata 12px | `PdfViewerModal` uses `h-screen` and unpkg CDN worker; `DocumentUploadDialog` duplicates `FileUploadDialog` | Missing storage offline banner in Files chip; missing `error.tsx` |
| `/notes/[id]` | Medium (`MarkdownEditor` + `AttachmentSection` + `LinkedNotesSection`) | Editor toolbar buttons < 44px on 360px | Metadata 12px | Keyboard covers bottom of markdown editor without `dvh` / scroll-into-view | Missing `error.tsx` |
| `/notes/graph` | High (SVG force graph canvas on 360px needs pan/zoom bounds) | Graph zoom/reset icon buttons < 44px | Node labels 10–12px | Heavy `d3` bundle loaded eagerly | Missing `error.tsx` |
| `/more` | Low | `list-row` items ~44px | Labels 14px | Missing `Reviews`, `Ask`, `Search` groupings; `MobileTabs` opens `MobileNavSheet` instead of `/more` or aligned menu | Static list |
| `/ask` | Low | Send button & prompt chips | 14px body | Input bar at bottom can be covered by soft keyboard without `dvh` + safe-area | Missing `error.tsx` |
| `/search` | Low | Search clear/filter buttons | 12–14px | Keyboard covers results on 360px | Has empty state; missing `error.tsx` |
| `/semesters` | Low | `CreateSemesterDialog` trigger & `Setup wizard` link (`min-h-[44px]`) | Status pills 11px | Centered `Dialog` on mobile | Has `EmptyState`; missing `error.tsx` |
| `/semesters/setup` | Low (5-step mobile stepper) | All step buttons `min-h-[44px]` | Labels 12–14px | Keyboard can obscure bottom inputs on step 1–4 | Missing `error.tsx` |
| `/semesters/[id]` | Low | Header action buttons `min-h-[44px]` | Metadata 12px | Centered dialogs | Has `EmptyState` |
| `/semesters/[id]/calendar` | Low | All form/import/audit controls `min-h-[44px]` | Metadata 12px | Scroll-to-form added in `45ce67d` | Has `EmptyState` |
| `/semesters/[id]/timetable` | Low | Weekday chips & duration presets `min-h-[44px]` | Metadata 12px | None | Has `EmptyState` |
| `/courses/[id]` | Low | Attendance cell buttons & exception buttons | Badges 11–12px | `FileManager` uses `FileUploadDialog` | Has `EmptyState` |
| `/dsa`, `/dsa/*` | Low–Medium (`dsa/problems` table/picker on 360px) | Topic/problem picker & icon buttons | Badges 11–12px | Heavy analytics/charting on `/dsa/report` | Has `EmptyState`; missing `error.tsx` |
| `/projects`, `/projects/[id]` | Low | Action buttons | 12–14px | Centered `Dialog` | Has `EmptyState`; missing `error.tsx` |
| `/routines` | Low | Routine completion & edit buttons | 12–14px | Centered `Dialog` | Has `EmptyState`; missing `error.tsx` |
| `/reviews`, `/reviews/[id]` | Low | Generate/archive buttons | 12–14px | None | Has `EmptyState`; missing `error.tsx` |
| `/settings` | Low | Toggle switches & form inputs (`min-h-[44px]` on newer sections) | Helper text 12px | Notification/location forms | Has `src/app/(app)/settings/error.tsx` |
| `/notifications/digest` | Low | Mark-read buttons | 12–14px | None | Has `EmptyState` |
| `/login`, `/signup` | Low | Submit buttons `min-h-[44px]` | 12–14px | Keyboard covers password/submit on 360px if `min-h-screen` used instead of `min-h-dvh` | Inline auth error |
