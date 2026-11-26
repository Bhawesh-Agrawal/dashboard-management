# Form Consistency Audit

This document tracks every entry-point / form pair in the app and confirms they share
a single component, preventing field drift regressions.

## Shared Form Components

| Component | File | Purpose |
|---|---|---|
| `TaskForm` | `src/features/tasks/components/TaskForm.tsx` | Unified task create/edit form. Accepts `mode="quick" \| "full"`, optional `task` for edit mode. |
| `BudgetForm` | `src/features/budget/components/BudgetForm.tsx` | Unified budget create/edit form. Accepts `mode="quick" \| "full"`, optional `entry` for edit mode. |
| `NoteForm` | `src/features/notes/components/NoteForm.tsx` | Shared note create/edit form. Accepts optional `note` for edit mode, `courses`/`folders` for "More options". |

## Entry-Point / Form Pairs

### Tasks

| Entry Point | File | Component Used | Mode | Notes |
|---|---|---|---|---|
| FAB Task tab | `src/components/layout/fab-cluster.tsx` | `<TaskForm>` | `quick` | Global quick-add. "More options" `<details>` has energy/duration/best-time. Mobile 2-step wizard includes all fields in step 2. |
| Tasks page "New Task" | `src/features/tasks/components/task-form.tsx` | `<TaskForm>` via `CreateTaskDialog` | `full` | Page header action button. Dialog wraps TaskForm. |
| Task list edit pencil | `src/features/tasks/components/edit-task-dialog.tsx` | `<TaskForm>` via `EditTaskDialog` | `full` | Pre-fills from `task` prop. Dialog wraps TaskForm. |
| Course page "+ Add" task | `src/features/courses/components/course-tasks.tsx` | `<TaskForm>` via `AddTaskForm` | `quick` | Pre-links `courseId`. Inline card layout. |
| Dashboard top-three | `src/features/dashboard/components/top-three.tsx` | `<EditTaskDialog>` | `full` | Reuses EditTaskDialog. |

**All task forms now share `TaskForm`.** Fields: title, notes, dueDate, priority, energyRequirement, estimatedDuration, optimalTimeOfDay, courseId/projectId. "More options" section contains energy/duration/best-time. Mobile wizard step 2 includes all fields.

### Notes

| Entry Point | File | Component Used | Mode | Notes |
|---|---|---|---|---|
| Quick Capture Text (AI) | `src/features/notes/components/quick-capture.tsx` | Custom AI-parse flow | quick | AI parses text into task/note. "More options" has tags, course, folder selectors. |
| Quick Capture Photo (OCR) | `src/features/notes/components/quick-capture.tsx` | Custom OCR flow | quick | OCR transcribes photo. "More options" has tags, course, folder selectors. |
| Quick Capture File | `src/features/notes/components/quick-capture.tsx` | `<FileUploadDialog>` | quick | File upload with course/semester context. |
| Notes page "Quick Capture" | `src/features/notes/components/quick-capture.tsx` | Same as above | quick | Mounted in `NotesPageClient`. |
| Note edit pencil | `src/features/notes/components/edit-note-dialog.tsx` | `<NoteForm>` via `EditNoteDialog` | full | Fetches courses/folders on open. Full markdown editor. |
| Note detail page | `src/app/(app)/notes/[id]/page.tsx` | `<EditNoteDialog>` | full | Reuses EditNoteDialog. |
| Course page "+ Add" note | `src/features/courses/components/course-notes.tsx` | Inline `AddNoteForm` | quick | Pre-links `courseId`. Has content, tags, sourceLink. |

**Notes use two patterns:**
1. **QuickCapture** — AI-parse/OCR flow with "More options" `<details>` for tags, course, folder.
2. **NoteForm** — Full markdown editor with metadata bar (tags, sourceLink) and "More options" `<details>` for course, folder.

Both patterns now support the same metadata fields (tags, courseId, folderId, sourceLink).

### Budgets

| Entry Point | File | Component Used | Mode | Notes |
|---|---|---|---|---|
| FAB Budget tab | `src/components/layout/fab-cluster.tsx` | `<BudgetForm>` | `quick` | Global quick-add. Compact layout. |
| Budget page "New Entry" | `src/features/budget/components/budget-form.tsx` | `<BudgetForm>` via `CreateBudgetDialog` | `full` | Page header action. Dialog wraps BudgetForm. |
| Budget list edit pencil | `src/features/budget/components/edit-budget-dialog.tsx` | `<BudgetForm>` via `EditBudgetDialog` | `full` | Pre-fills from `entry` prop. Dialog wraps BudgetForm. |

**All budget forms now share `BudgetForm`.** Fields: type, amount, category (8 options), date, notes. Same categories across all entry points.

### Other

| Entry Point | File | Component Used | Notes |
|---|---|---|---|
| Widget quick-add API | `src/app/api/widget/quick-add/route.ts` | N/A (headless) | Server-side only. Accepts `{ text }`, uses NLP to create task or note. |

## Field Parity Checklist

### Tasks — all entry points now include:
- [x] Title (required)
- [x] Notes
- [x] Due Date & Time
- [x] Priority (High/Medium/Low/Lowest)
- [x] Energy Level (behind "More options" in quick mode)
- [x] Estimated Duration (behind "More options" in quick mode)
- [x] Best Time of Day (behind "More options" in quick mode)
- [x] Link to Course/Project (via `LinkToPicker`)

### Notes — all entry points now include:
- [x] Content (AI-parsed, OCR-transcribed, or typed)
- [x] Tags (user-editable, not just AI-detected)
- [x] Source Link (for photo/OCR mode)
- [x] Course linking (behind "More options" in QuickCapture, "More options" in NoteForm)
- [x] Folder assignment (behind "More options" in QuickCapture, "More options" in NoteForm)

### Budgets — all entry points now include:
- [x] Type (Expense/Income)
- [x] Amount (INR)
- [x] Category (all 8 options: Food, Rent, Books, Subscriptions, Transport, Entertainment, Health, Other)
- [x] Date
- [x] Notes

## How to Prevent Regression

1. **Never add fields directly to a dialog wrapper.** Always add fields to the shared component (`TaskForm`, `BudgetForm`, `NoteForm`).
2. **New fields go behind `<details>` "More options"** in `quick` mode, visible by default in `full` mode.
3. **Mobile wizard step 2** must include all fields — never drop fields from step 2.
4. **When adding a field to any form**, update this checklist and verify all entry points.
5. **Server actions** (`createTask`, `createNote`, `createBudgetEntry`) accept the full field set. Client forms are responsible for which fields to expose.
