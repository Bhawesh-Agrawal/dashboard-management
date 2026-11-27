# Notes Capture Inbox Guide

`/notes` is an inbox-first capture space designed for fast phone entry — replacing "send it to myself on WhatsApp".

## 1. How to Capture

- **From anywhere:** Tap the floating **+** button -> **Capture Note**.
- **From Notes:** Tap **Capture** at the top of `/notes`.
- **Kind chips:** Choose **Note**, **Link**, **Quote**, **Meeting**, or **Steps**.
  - Pasting a URL automatically switches the kind to **Link**.
  - Tap **Paste** to insert from your clipboard in one tap.
- **Optimistic Save & Undo:** Tapping **Save** closes the sheet immediately and shows a **Saved** toast with a 10-second **Undo** action.
  - Link metadata (title, description, thumbnail, YouTube/Spotify type) enriches in the background without blocking the save.
  - If saving fails, your draft stays in `localStorage` with a **Not saved, tap to retry** button.

## 2. How to Share from Other Apps

- **Android (Chrome PWA):** Install CodexDash from Chrome, then use the system Share sheet from YouTube, Spotify, or Chrome to share directly to **CodexDash** (`/capture/share`). See [docs/PWA.md](file:///home/bhawesh/Projects/dashboard-management/docs/PWA.md).
- **iPhone / iPad:** Copy the link or text, open **Capture**, and tap **Paste**.

## 3. Meeting Minutes, Quotes, and Steps

- **Meeting Minutes:** Defaults to `Meeting, <date>`, keeps **Notes** and **Action Items** expanded, and collapses details/decisions. Convert individual or all action items to Tasks (`To Task` / `Create tasks`), or tap **Copy as text** / **Share** for clean WhatsApp/email plain text.
- **Quotes & Steps:** Tap any Quote or Steps item in `/notes` to edit inline, check off steps, or reorder steps.

## 4. How to Find & Organize

- **Filters:** Switch between **All**, **Links**, **Quotes**, **Meetings**, **Steps**, **Notes**, **Files** (Document Library), **Pinned**, and **Archived**.
- **Search:** Type in the search box to search titles, body text, URLs, and `#tags` on the server.
- **Row actions:** Pin, Archive, Copy, Share, Add tag, Convert to task, Open full editor (`/notes/[id]`), or Delete (with confirmation).
- **Advanced tools:** **Knowledge Graph** (`/notes/graph`), **Vault Import**, and **Daily Note** live under the **More** (`...`) menu at the top right of `/notes`.
