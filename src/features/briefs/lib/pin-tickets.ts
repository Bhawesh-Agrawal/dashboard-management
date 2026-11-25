import type { BriefPayload, BriefTravelItem } from "./build";
import {
  isDocumentCached,
  saveDocumentOffline,
} from "@/lib/pdf/offline-cache";

export interface TravelEventLike {
  id: string;
  title: string;
  dateTime: Date;
  location: string | null;
  isTravel: boolean | null;
  eventDocuments?: Array<{
    note: {
      id: string;
      title: string | null;
      fileName: string | null;
      s3Url: string | null;
    };
  }>;
}

export function selectTravelEventsWithin48Hours(
  events: TravelEventLike[],
  now: Date,
  formatLabel: (date: Date) => string
): BriefTravelItem[] {
  const cutoffMs = now.getTime() + 48 * 60 * 60 * 1000;
  return events
    .filter((e) => {
      if (!e.isTravel) return false;
      const ts = e.dateTime.getTime();
      return ts >= now.getTime() && ts <= cutoffMs;
    })
    .map((e) => ({
      eventId: e.id,
      title: e.title,
      dateTimeLabel: formatLabel(e.dateTime),
      location: e.location,
      documents: (e.eventDocuments ?? []).map((ed) => ({
        noteId: ed.note.id,
        title: ed.note.fileName || ed.note.title || "Ticket",
        offlineUrl: ed.note.s3Url || `/notes/${ed.note.id}`,
      })),
    }));
}

export async function pinTravelDocuments(
  briefs: Array<BriefPayload | null | undefined>,
  deps?: {
    isOnline?: boolean;
    isCached?: (fileId: string) => Promise<boolean>;
    saveOffline?: (
      fileId: string,
      url: string
    ) => Promise<{ ok: boolean; error?: string }>;
  }
): Promise<number> {
  const isOnline =
    deps?.isOnline ?? (typeof navigator !== "undefined" ? navigator.onLine : false);
  if (!isOnline) return 0;

  const checkCached = deps?.isCached ?? isDocumentCached;
  const saveOffline = deps?.saveOffline ?? saveDocumentOffline;

  let pinnedCount = 0;
  const seenNoteIds = new Set<string>();

  for (const brief of briefs) {
    if (!brief) continue;
    for (const section of brief.sections) {
      if (section.id !== "travel" && section.id !== "travel_tomorrow") continue;
      for (const item of section.items) {
        for (const doc of item.documents ?? []) {
          if (seenNoteIds.has(doc.noteId)) continue;
          seenNoteIds.add(doc.noteId);
          const alreadyCached = await checkCached(doc.noteId);
          if (!alreadyCached) {
            const res = await saveOffline(doc.noteId, doc.offlineUrl);
            if (res.ok) pinnedCount += 1;
          }
        }
      }
    }
  }

  return pinnedCount;
}
