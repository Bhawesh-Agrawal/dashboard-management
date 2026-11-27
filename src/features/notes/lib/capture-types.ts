import { z } from "zod";

export const NOTE_KINDS = ["note", "link", "quote", "meeting", "checklist"] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];
export const noteKindSchema = z.enum(NOTE_KINDS);

export const LINK_CONTENT_TYPES = [
  "youtube_video",
  "youtube_playlist",
  "spotify_playlist",
  "spotify_album",
  "spotify_track",
  "spotify_episode",
  "article",
  "generic",
] as const;
export type LinkContentType = (typeof LINK_CONTENT_TYPES)[number];

export const linkMetaSchema = z.object({
  url: z.string().url(),
  host: z.string().min(1),
  siteName: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  thumbnail: z.string().optional().nullable(),
  contentType: z.enum(LINK_CONTENT_TYPES).default("generic"),
  fetchedAt: z.string().optional().nullable(),
  fetchError: z.string().optional().nullable(),
});
export type LinkMeta = z.infer<typeof linkMetaSchema>;

export const quoteMetaSchema = z.object({
  text: z.string().min(1),
  source: z.string().optional().nullable(),
});
export type QuoteMeta = z.infer<typeof quoteMetaSchema>;

export const meetingActionItemSchema = z.object({
  text: z.string().min(1),
  done: z.boolean().default(false),
  owner: z.string().optional().nullable(),
  due: z.string().optional().nullable(),
  taskId: z.string().optional().nullable(),
});
export type MeetingActionItem = z.infer<typeof meetingActionItemSchema>;

export const meetingMetaSchema = z.object({
  date: z.string().min(1),
  attendees: z.string().default(""),
  agenda: z.string().default(""),
  decisions: z.string().default(""),
  actionItems: z.array(meetingActionItemSchema).default([]),
  nextMeeting: z.string().optional().nullable(),
});
export type MeetingMeta = z.infer<typeof meetingMetaSchema>;

export const checklistItemSchema = z.object({
  text: z.string().min(1),
  done: z.boolean().default(false),
});
export type ChecklistItem = z.infer<typeof checklistItemSchema>;

export const checklistMetaSchema = z.object({
  items: z.array(checklistItemSchema).default([]),
});
export type ChecklistMeta = z.infer<typeof checklistMetaSchema>;

export type NoteMeta = LinkMeta | QuoteMeta | MeetingMeta | ChecklistMeta;

export function validateNoteMeta(kind: NoteKind, meta: unknown) {
  switch (kind) {
    case "link":
      return linkMetaSchema.safeParse(meta);
    case "quote":
      return quoteMetaSchema.safeParse(meta);
    case "meeting":
      return meetingMetaSchema.safeParse(meta);
    case "checklist":
      return checklistMetaSchema.safeParse(meta);
    case "note":
    default:
      return z.undefined().or(z.null()).or(z.record(z.string(), z.unknown())).safeParse(meta);
  }
}
