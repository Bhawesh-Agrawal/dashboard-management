# Notes Feature Audit (Phase 9)

## 1. Existing Architecture & Surfaces

- **Pages:**
  - `/notes` ([src/app/(app)/notes/page.tsx](file:///home/bhawesh/Projects/dashboard-management/src/app/(app)/notes/page.tsx)) -> renders `NotesPageClient` backed by Dexie `useNotes()` hook (`src/lib/sync/hooks.ts`), with tabs (`All`, `Documents`, `Links`, `Favorites`), quick filter chips, search, `NotesSidebar` (drawer on mobile), `QuickCapture`, `VaultImportDialog`, and `DailyNoteButton`.
  - `/notes/[id]` ([src/app/(app)/notes/[id]/page.tsx](file:///home/bhawesh/Projects/dashboard-management/src/app/(app)/notes/[id]/page.tsx)) -> note detail with `NoteForm` / `MarkdownEditor`, attachments, `RelatedNotesPanel`, `AddLinkDialog`, and `PdfViewerModal` for document entries.
  - `/notes/graph` ([src/app/(app)/notes/graph/page.tsx](file:///home/bhawesh/Projects/dashboard-management/src/app/(app)/notes/graph/page.tsx)) -> lazy-loaded `NoteGraphClient` (`react-force-graph-2d`).
- **API Routes:**
  - `GET /api/notes/graph` -> calls `getNoteGraphData(userId, 100)`.
  - `GET /api/notes/[id]/backlinks` -> queries `noteLink` where `targetId: id` and `source: { userId }`.
  - `GET /api/notes/[id]/related` -> calls `getRelatedNotes(id, 10)`.
  - `POST /api/notes/link-metadata` -> fetches HTML `<meta>` OG/title/description/image/favicon (previously lacked SSRF/IP/size-cap/oEmbed protections).
- **Server Modules (`src/features/notes/lib/`):**
  - `queries.ts`: `getNotes`, `getNoteById`, `getDocumentLibraryNotes`.
  - `actions.ts`: `createNote`, `updateNote`, `deleteNote`, `recordNoteView`, `createExplicitLink`, `removeExplicitLink`, `addAttachments`, `removeAttachment`, `getFileViewUrl`.
  - `actions-documents.ts`: DocumentLibrary CRUD & folders (`createDocumentFolder`, `createDocumentNote`, `updateDocumentNote`, `deleteDocumentNote`, etc.).
  - `actions-annotations.ts`: PDF annotations CRUD (`createAnnotation`, `updateAnnotation`, `deleteAnnotation`, `getAnnotations`).
  - `actions-attachments.ts`: Note attachments CRUD.
  - `actions-import.ts`: Markdown/Obsidian vault import (`importVaultFiles`).
  - `actions-convert.ts`: DOCX -> Markdown conversion (`convertDocxToMarkdown`).
  - `actions-nlp.ts` & `nlp-parsing.ts`: Quick capture freeform parsing into Task or Note.
  - `semantic-links.ts`: Keyword similarity & `NoteLink` graph generation.

## 2. What Is Heavy on Mobile Today

1. **Client-side Dexie full-table load (`useNotes()`):** `/notes` previously relied on `NotesPageClient` pulling all synced notes into memory with tab switching (`All`, `Documents`, `Links`, `Favorites`) and folder sidebar chrome before showing a single item.
2. **Capture friction:** `QuickCapture` had no one-tap kind chips (Link, Quote, Meeting, Steps), no URL auto-detection, no clipboard paste button, and no optimistic save with Undo / local draft recovery.
3. **Heavy tools at top level:** Vault import, graph, and backlinks competed with quick capture and reading on small screens (`360x800` / `390x844`).
4. **Link metadata:** `POST /api/notes/link-metadata` did not block private/loopback/link-local IPs (SSRF), had no 1 MB response cap, no redirect limit, and no YouTube/Spotify oEmbed/contentType extraction.

## 3. Ownership Scoping Audit & Fixes Applied

Every notes query, action, and API route was audited against `getCurrentUserId()` + `ownerWhere(userId)` (which enforces `{ userId }` when `STRICT_OWNER_SCOPING === "true"` and `{ OR: [{ userId }, { userId: null }] }` otherwise):

| Module / Function | Prior Gap | Fix Applied |
| --- | --- | --- |
| `queries.ts` -> `getNotes`, `getNoteById`, `getDocumentLibraryNotes` | No `getCurrentUserId()`, no `ownerWhere(userId)` filter (`findUnique` by `id` only) | Added `getCurrentUserId()` and `ownerWhere(userId)` (`findFirst` for `getNoteById`) |
| `actions.ts` -> `updateNote` | No `getCurrentUserId()`, updated any `id` unconditionally | Added `getCurrentUserId()` + `findFirst({ where: { id, ...ownerWhere(userId) } })` check |
| `actions.ts` -> `deleteNote` | Checked `note.userId !== userId` (blocked `null` legacy rows even when `STRICT_OWNER_SCOPING !== "true"`) | Replaced with `findFirst({ where: { id, ...ownerWhere(userId) } })` |
| `actions.ts` -> `createExplicitLink`, `removeExplicitLink` | No `getCurrentUserId()`, no ownership check on `sourceId`/`targetId` | Added `getCurrentUserId()` + ownership verification of both `sourceId` and `targetId` via `ownerWhere(userId)` |
| `semantic-links.ts` -> `getRelatedNotes` & `/api/notes/[id]/related` | Did not verify owner of `noteId` or filter linked notes by `ownerWhere(userId)` | Added `userId` parameter & `ownerWhere(userId)` filtering in `getRelatedNotes`, passed `userId` from `/api/notes/[id]/related` |
| `actions-convert.ts`, `actions-documents.ts`, `actions-annotations.ts`, `actions-attachments.ts`, `actions-folders.ts`, `actions-import.ts`, `/api/notes/graph`, `/api/notes/[id]/backlinks` | Already called `getCurrentUserId()` and scoped by `userId` / `ownerWhere` | Verified |

## 4. Offline Policy (Phase 9 Known Limitation)

- **Online-only for Phase 9:** New capture kinds (`link`, `quote`, `meeting`, `checklist`), `meta` JSON, and `archivedAt` are persisted directly to Postgres via server actions/queries without adding new Dexie tables or sync queue entries.
- **Draft safety:** Unsaved/failed captures persist in `localStorage` so no typed text is lost on network failure, with a `"Not saved, tap to retry"` action.
- **Proposed later offline queue:** Add `kind`, `meta`, and `archivedAt` columns to Dexie `notes` table (`db.version(N)`), enqueue `note:create` / `note:update` mutations into `syncQueue` when offline, and run background link enrichment once online sync completes.
