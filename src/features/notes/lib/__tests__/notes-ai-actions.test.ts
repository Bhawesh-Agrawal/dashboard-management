import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ExtractActionItemsSchema,
  LinkSummarySchema,
  TidyMinutesSchema,
} from "../notes-ai-actions";

const mocks = vi.hoisted(() => ({
  getCurrentUserId: vi.fn(),
  noteFindFirst: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  getCurrentUserId: mocks.getCurrentUserId,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    note: { findFirst: mocks.noteFindFirst, update: vi.fn() },
  },
}));

import { summarizeLinkNoteAction, tidyMeetingMinutesAction } from "../notes-ai-actions";

describe("Notes AI actions validation & failure states", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUserId.mockResolvedValue("u1");
  });

  it("validates LinkSummarySchema, TidyMinutesSchema, and ExtractActionItemsSchema", () => {
    expect(LinkSummarySchema.safeParse({ bullets: ["One", "Two", "Three"] }).success).toBe(true);
    expect(LinkSummarySchema.safeParse({ bullets: ["Only one"] }).success).toBe(false);

    expect(
      TidyMinutesSchema.safeParse({
        decisions: "Ship on Friday",
        actionItems: [{ text: "Write tests", owner: "Alex", due: "2026-12-01" }],
      }).success
    ).toBe(true);

    expect(
      ExtractActionItemsSchema.safeParse({ items: [{ text: "Step 1", done: false }] }).success
    ).toBe(true);
  });

  it("returns clear errors when note is missing or has no URL", async () => {
    mocks.noteFindFirst.mockResolvedValue(null);
    expect(await summarizeLinkNoteAction("missing")).toEqual({
      ok: false,
      error: "Note not found",
    });
    expect(await tidyMeetingMinutesAction("missing")).toEqual({
      ok: false,
      error: "Note not found",
    });

    mocks.noteFindFirst.mockResolvedValue({
      id: "n1",
      kind: "note",
      title: "Plain note",
      content: "No link",
      sourceLink: null,
      meta: null,
    });
    expect(await summarizeLinkNoteAction("n1")).toEqual({
      ok: false,
      error: "This note does not have a URL to summarize",
    });
  });
});
