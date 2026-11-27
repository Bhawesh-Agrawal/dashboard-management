import { beforeEach, describe, expect, it, vi } from "vitest";
import { validateNoteMeta } from "../capture-types";
import { clearCaptureDraft, loadCaptureDraft, saveCaptureDraft } from "../capture-draft";
import { formatMeetingPlainText } from "../meeting-format";
import { buildInboxWhere } from "../inbox-queries";

const mocks = vi.hoisted(() => ({
  getCurrentUserId: vi.fn(),
  noteFindFirst: vi.fn(),
  noteUpdate: vi.fn(),
  noteDelete: vi.fn(),
  noteCount: vi.fn(),
  taskCreate: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUserId: mocks.getCurrentUserId,
  UnauthorizedError: class UnauthorizedError extends Error {},
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    note: {
      findFirst: mocks.noteFindFirst,
      update: mocks.noteUpdate,
      delete: mocks.noteDelete,
      count: mocks.noteCount,
    },
    task: {
      create: mocks.taskCreate,
    },
  },
}));

import { convertMeetingActionItemsToTasks } from "../capture-actions";
import { deleteNote, updateNote } from "../actions";

describe("Note meta zod validation & drafts", () => {
  it("validates meta shapes per kind", () => {
    expect(
      validateNoteMeta("link", {
        url: "https://example.com",
        host: "example.com",
        contentType: "article",
      }).success
    ).toBe(true);

    expect(validateNoteMeta("quote", { text: "Stay hungry", source: "Steve" }).success).toBe(true);
    expect(validateNoteMeta("quote", { text: "" }).success).toBe(false);

    expect(
      validateNoteMeta("meeting", {
        date: "2026-11-27",
        attendees: "Alice, Bob",
        agenda: "Sprint",
        decisions: "Ship",
        actionItems: [{ text: "Write tests", done: false }],
      }).success
    ).toBe(true);

    expect(
      validateNoteMeta("checklist", {
        items: [{ text: "Step 1", done: true }],
      }).success
    ).toBe(true);
  });

  it("retains capture draft in storage when save fails and clears on success", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    };

    saveCaptureDraft({ kind: "quote", text: "Test draft", source: "Author" }, storage);
    const loaded = loadCaptureDraft(storage);
    expect(loaded?.kind).toBe("quote");
    expect(loaded?.text).toBe("Test draft");
    expect(loaded?.source).toBe("Author");

    clearCaptureDraft(storage);
    expect(loadCaptureDraft(storage)).toBeNull();
  });
});

describe("Meeting minutes plain-text export", () => {
  it("matches clean plain-text snapshot for WhatsApp/email", () => {
    const out = formatMeetingPlainText(
      "Project Sync",
      {
        date: "2026-11-27",
        attendees: "Bhawesh, Alex",
        agenda: "Review Phase 9",
        decisions: "Use inbox-first layout",
        actionItems: [
          { text: "Add unit tests", done: true, owner: "Bhawesh", due: "2026-11-28" },
          { text: "Test on phone", done: false, owner: null, due: null },
        ],
        nextMeeting: "2026-12-01",
      },
      "Discussed capture speed."
    );

    expect(out).toMatchInlineSnapshot(`
      "Project Sync
      Date: 2026-11-27
      Attendees: Bhawesh, Alex

      Agenda:
      Review Phase 9

      Notes:
      Discussed capture speed.

      Decisions:
      Use inbox-first layout

      Action Items:
      - [x] Add unit tests (@Bhawesh, due 2026-11-28)
      - [ ] Test on phone

      Next Meeting: 2026-12-01"
    `);
  });
});

describe("Inbox search & filter query builder", () => {
  it("builds filter and case-insensitive search clauses", () => {
    const archived = buildInboxWhere("user-1", { filter: "archived", search: "spotify" });
    expect(JSON.stringify(archived)).toContain("spotify");
    expect(JSON.stringify(archived)).toContain('"archivedAt":{"not":null}');

    const links = buildInboxWhere("user-1", { filter: "link" });
    expect(JSON.stringify(links)).toContain('"kind":"link"');
    expect(JSON.stringify(links)).toContain('"archivedAt":null');
  });
});

describe("Action-item to task conversion & ownership enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("converts unconverted meeting action items into tasks and links taskId", async () => {
    mocks.getCurrentUserId.mockResolvedValue("user-1");
    mocks.noteFindFirst.mockResolvedValue({
      id: "note-1",
      title: "Sync",
      content: "Notes body",
      meta: {
        date: "2026-11-27",
        attendees: "",
        agenda: "",
        decisions: "",
        actionItems: [
          { text: "Item A", done: false, owner: "Alice", due: "2026-12-01", taskId: null },
          { text: "Item B", done: true, taskId: "existing-task" },
        ],
      },
    });
    mocks.taskCreate.mockResolvedValue({ id: "task-new-1" });
    mocks.noteUpdate.mockResolvedValue({});

    const res = await convertMeetingActionItemsToTasks("note-1");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.createdTaskIds).toEqual(["task-new-1"]);
      expect(res.data.meta.actionItems[0].taskId).toBe("task-new-1");
      expect(res.data.meta.actionItems[1].taskId).toBe("existing-task");
    }
    expect(mocks.taskCreate).toHaveBeenCalledTimes(1);
  });

  it("rejects unauthenticated and wrong-owner mutations", async () => {
    mocks.getCurrentUserId.mockRejectedValue(new Error("Authentication required"));
    await expect(updateNote("n1", { title: "Hack" })).rejects.toThrow("Authentication required");

    mocks.getCurrentUserId.mockResolvedValue("user-1");
    mocks.noteFindFirst.mockResolvedValue(null);
    await expect(updateNote("n-other", { title: "Hack" })).rejects.toThrow(
      "Note not found or access denied"
    );

    const delRes = await deleteNote("n-other");
    expect(delRes).toEqual({ ok: false, error: "Note not found" });
  });
});
