import { describe, expect, it, vi } from "vitest";
import {
  parseCalendarTextDeterministic,
  parseCalendarWithAI,
  parseIcsAllDayEvents,
} from "../calendar-import";

describe("Academic Calendar Import Parsers (Item 4)", () => {
  it("parses deterministic text formats including ranges, en/em dashes, dd/mm/yyyy, and follows_weekday", () => {
    const input = [
      "26 Jan 2027 – Republic Day",
      "10-15 Mar: Mid-semester exams",
      "Sat 13 Feb follows Monday timetable",
      "02/04/2027 — Good Friday",
      "Unparseable random line here",
    ].join("\n");

    const res = parseCalendarTextDeterministic(input, 2027);
    expect(res.entries).toHaveLength(4);
    expect(res.warnings).toHaveLength(1);

    expect(res.entries[0]).toMatchObject({
      kind: "holiday",
      title: "Republic Day",
      startDate: "2027-01-26",
      endDate: "2027-01-26",
      cancelsClasses: true,
    });

    expect(res.entries[1]).toMatchObject({
      kind: "exam_period",
      title: "Mid-semester exams",
      startDate: "2027-03-10",
      endDate: "2027-03-15",
      cancelsClasses: true,
    });

    expect(res.entries[2]).toMatchObject({
      kind: "follows_weekday",
      startDate: "2027-02-13",
      followsWeekday: 1,
      cancelsClasses: false,
    });

    expect(res.entries[3]).toMatchObject({
      kind: "holiday",
      title: "Good Friday",
      startDate: "2027-04-02",
    });
  });

  it("parses all-day VEVENTs from ICS and adjusts exclusive DTEND", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "DTSTART;VALUE=DATE:20270310",
      "DTEND;VALUE=DATE:20270316",
      "SUMMARY:Spring Break",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "DTSTART;VALUE=DATE:20270126",
      "SUMMARY:Republic Day",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const res = parseIcsAllDayEvents(ics);
    expect(res.entries).toHaveLength(2);
    expect(res.entries[0]).toMatchObject({
      kind: "break",
      title: "Spring Break",
      startDate: "2027-03-10",
      endDate: "2027-03-15", // DTEND 16 minus 1 day
    });
    expect(res.entries[1]).toMatchObject({
      kind: "holiday",
      title: "Republic Day",
      startDate: "2027-01-26",
      endDate: "2027-01-26",
    });
  });

  it("parses with AI, flags low-confidence rows, and handles malformed output/timeouts", async () => {
    const llmCall = vi.fn().mockResolvedValue(
      JSON.stringify({
        entries: [
          {
            title: "Convocation",
            kind: "no_classes",
            startDate: "2027-02-20",
            endDate: "2027-02-20",
            cancelsClasses: true,
            followsWeekday: null,
            confidence: 0.6,
          },
        ],
      })
    );

    const ok = await parseCalendarWithAI("20 Feb Convocation", {
      defaultYear: 2027,
      llmCall,
    });
    expect(ok.entries).toHaveLength(1);
    expect(ok.entries[0].lowConfidence).toBe(true);
    expect(ok.entries[0].warning).toContain("Low confidence");

    const bad = await parseCalendarWithAI("20 Feb", {
      llmCall: vi.fn().mockResolvedValue("invalid json"),
    });
    expect(bad.entries).toHaveLength(0);
    expect(bad.warnings.length).toBeGreaterThan(0);

    const timedOut = await parseCalendarWithAI("20 Feb", {
      llmCall: vi.fn(() => new Promise<string>(() => {})),
      timeoutMs: 15,
    });
    expect(timedOut.entries).toHaveLength(0);
    expect(timedOut.warnings[0]).toContain("timeout");
  });
});
