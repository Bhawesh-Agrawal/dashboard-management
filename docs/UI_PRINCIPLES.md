# UI Principles

Derived strictly from the existing application code. Every rule below cites the file(s) where the pattern is implemented.

## 1. Design Tokens & Color Palette

- **Semantic CSS variables** (`src/app/globals.css`): All surfaces, text, borders, and accents use the semantic tokens mapped in `@theme inline`:
  - Surfaces & text: `--background`, `--foreground`, `--card`, `--card-foreground`, `--popover`, `--popover-foreground`
  - Interactive & hierarchy: `--primary`, `--primary-foreground`, `--secondary`, `--secondary-foreground`, `--muted`, `--muted-foreground`, `--accent`, `--accent-foreground`
  - Risk / error: `--destructive`, `--destructive-foreground`
  - Chrome: `--border`, `--input`, `--ring`
- **No hardcoded Tailwind palette colors**: Reference screens avoid `red-*`, `green-*`, `emerald-*`, `rose-*`, `amber-*`, `blue-*`, etc. Use `foreground`, `muted-foreground`, `muted`, `card`, `border`, `primary`, and `destructive` (reserved for genuine risk/error states).

## 2. Shared UI Primitives

- Available primitives in `src/components/ui/`:
  - `Button` (`src/components/ui/button.tsx`): variants `default`, `destructive`, `outline`, `secondary`, `ghost`, `link`; sizes `default`, `sm`, `lg`, `icon`.
  - `Dialog` (`src/components/ui/dialog.tsx`): modal dialogs (`src/features/tasks/components/task-form.tsx`).
  - `Sheet` (`src/components/ui/sheet.tsx`): slide-over / bottom-sheet panels (`src/features/notes/components/NotesPageClient.tsx`).
  - `ContextMenu` (`src/components/ui/context-menu.tsx`), `Toaster` (`src/components/ui/sonner.tsx`).
- Available shared layout/state components in `src/components/shared/`:
  - `PageHeader` (`src/components/shared/page-header.tsx`): page title, optional subtitle, optional `backHref`, and right-aligned `action`.
  - `EmptyState` (`src/components/shared/empty-state.tsx`): centered empty-state message with optional description and action button (`src/features/tasks/components/tasks-page-client.tsx`).
- Note: There are no separate `Badge`, `Card`, `Tabs`, or `ToggleGroup` files in `src/components/ui/`. Those patterns are composed directly with semantic Tailwind classes (documented below).

## 3. Typography & Hierarchy

- **Page headings**: Use `.page-heading` (`font-serif`) via `PageHeader` or section `<h2>` (`src/app/globals.css`, `src/app/(app)/settings/page.tsx`).
- **Section labels**: Use `.section-label` for uppercase, tracked, small muted headers above groups and widgets (`src/app/globals.css`, `src/features/tasks/components/task-list.tsx`, `src/features/tasks/components/task-filters.tsx`).
- **Row metadata**: Primary title in `text-sm font-medium text-foreground`; secondary metadata (dates, times, locations, counts) in `text-xs text-muted-foreground` (`src/features/tasks/components/task-list.tsx`, `src/app/(app)/courses/[id]/page.tsx`).

## 4. Spacing, Borders & Radius

- **Page & section rhythm**:
  - Major sections on detail/settings pages use `space-y-10` with `border-t border-border pt-10` dividers (`src/app/(app)/settings/page.tsx`, `src/app/(app)/courses/[id]/page.tsx`).
  - Inner groups use `space-y-6` or `space-y-3` (`src/features/tasks/components/task-list.tsx`, `src/features/tasks/components/task-filters.tsx`).
- **Cards & containers**: `rounded-xl border border-border bg-card` (or `rounded-lg border border-border`) with `p-4` (`src/features/settings/components/timezone-settings.tsx`, `src/app/(app)/semesters/page.tsx`).
- **Buttons & inputs**: `rounded-md` or `rounded-lg` (`src/components/ui/button.tsx`, `src/features/tasks/components/task-form.tsx`).

## 5. List Rows, Tabs, Status & Stat Cards

- **List rows**: Plain rows separated by `space-y-0.5` or `divide-y divide-border`, styled with `.list-row` or `py-3 px-2` (`src/app/globals.css`, `src/features/tasks/components/task-list.tsx`, `src/app/(app)/semesters/page.tsx`).
- **Segmented tabs / filter toggles**:
  - Container: `flex gap-1 p-1 bg-muted rounded-md` (`src/features/notes/components/NoteTabs.tsx`), or inline filter chips (`src/features/tasks/components/task-filters.tsx`).
  - Active item: `bg-foreground text-background font-medium` (`src/features/tasks/components/task-filters.tsx`), `bg-background text-foreground font-medium shadow-sm` (`src/features/notes/components/NoteTabs.tsx`), or `bg-primary text-primary-foreground` for primary selection.
  - Inactive item: `text-muted-foreground hover:text-foreground`.
- **Status display**: Keep status text neutral (`text-muted-foreground` or `text-foreground`). Reserve `text-destructive` for genuine risk (e.g., overdue tasks in `src/features/tasks/components/task-list.tsx` or attendance below target).
- **Stat summaries**: Display large numeric value (`text-3xl font-bold tracking-tight text-foreground` or `text-lg font-medium`) paired with muted context (`text-xs text-muted-foreground`).

## 6. Empty States, Error States & Mobile Ergonomics

- **Empty states**: Use `<EmptyState title="..." description="..." action={...} />` (`src/components/shared/empty-state.tsx`, `src/features/tasks/components/tasks-page-client.tsx`) or a compact bordered empty card (`src/features/dashboard/components/today-dashboard.tsx`).
- **Error states**: Inline `text-xs text-destructive` with a plain retry trigger (`Not saved, tap to retry`) (`src/features/attendance/components/course-attendance-section.tsx`).
- **Mobile-first & 44px touch targets**: Interactive controls (tab buttons, toggle segments, action buttons) enforce `min-h-[44px]` on mobile (`src/app/globals.css`, `src/features/notes/components/NoteTabs.tsx`).
- **Dialogs & Sheets**: Modals use `DialogContent` with `max-w-[calc(100%-2rem)] sm:max-w-md` (`src/features/tasks/components/task-form.tsx`); mobile drawers/sheets use `Sheet` (`src/components/ui/sheet.tsx`, `src/features/notes/components/NotesPageClient.tsx`).
