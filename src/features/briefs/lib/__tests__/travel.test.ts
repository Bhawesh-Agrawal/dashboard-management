import { describe, it, expect, vi } from "vitest";
import {
  pinTravelDocuments,
  selectTravelEventsWithin48Hours,
} from "../pin-tickets";
import type { BriefPayload } from "../build";

describe("Travel & Ticket Offline Pinning (Step 10)", () => {
  it("selects only isTravel events within the next 48 hours", () => {
    const now = new Date("2026-11-25T08:00:00.000Z");
    const events = [
      {
        id: "past",
        title: "Old Flight",
        dateTime: new Date("2026-11-25T06:00:00.000Z"),
        location: "TIA",
        isTravel: true,
        eventDocuments: [],
      },
      {
        id: "soon",
        title: "Train to Pokhara",
        dateTime: new Date("2026-11-26T10:00:00.000Z"),
        location: "Station",
        isTravel: true,
        eventDocuments: [
          {
            note: {
              id: "note-ticket-1",
              title: "Train Ticket",
              fileName: "ticket.pdf",
              s3Url: "https://cdn.example/ticket.pdf",
            },
          },
        ],
      },
      {
        id: "not-travel",
        title: "Team Sync",
        dateTime: new Date("2026-11-26T12:00:00.000Z"),
        location: "Office",
        isTravel: false,
        eventDocuments: [],
      },
      {
        id: "too-far",
        title: "Next Month Flight",
        dateTime: new Date("2026-11-28T08:00:00.000Z"),
        location: "Airport",
        isTravel: true,
        eventDocuments: [],
      },
    ];

    const selected = selectTravelEventsWithin48Hours(
      events,
      now,
      (d) => d.toISOString().slice(0, 16)
    );

    expect(selected).toHaveLength(1);
    expect(selected[0].eventId).toBe("soon");
    expect(selected[0].documents[0]).toEqual({
      noteId: "note-ticket-1",
      title: "ticket.pdf",
      offlineUrl: "https://cdn.example/ticket.pdf",
    });
  });

  it("pins uncached travel ticket documents when online and skips when offline or cached", async () => {
    const brief: BriefPayload = {
      kind: "morning",
      forDate: "2026-11-25",
      weatherLine: null,
      earliestCommitment: null,
      pushSummary: "Today: 1 travel.",
      sections: [
        {
          id: "travel",
          title: "Upcoming Travel (48h)",
          linkHref: "/calendar",
          linkLabel: "Calendar",
          items: [
            {
              label: "Flight",
              documents: [
                {
                  noteId: "doc-1",
                  title: "Boarding Pass",
                  offlineUrl: "https://cdn.example/pass.pdf",
                },
                {
                  noteId: "doc-2",
                  title: "Hotel Voucher",
                  offlineUrl: "https://cdn.example/hotel.pdf",
                },
              ],
            },
          ],
        },
      ],
    };

    const saveOffline = vi.fn().mockResolvedValue({ ok: true });
    const isCached = vi
      .fn()
      .mockResolvedValueOnce(false) // doc-1 not cached
      .mockResolvedValueOnce(true); // doc-2 already cached

    const offlineCount = await pinTravelDocuments([brief], {
      isOnline: false,
      isCached,
      saveOffline,
    });
    expect(offlineCount).toBe(0);
    expect(saveOffline).not.toHaveBeenCalled();

    const onlineCount = await pinTravelDocuments([brief], {
      isOnline: true,
      isCached,
      saveOffline,
    });
    expect(onlineCount).toBe(1);
    expect(saveOffline).toHaveBeenCalledTimes(1);
    expect(saveOffline).toHaveBeenCalledWith("doc-1", "https://cdn.example/pass.pdf");
  });
});
