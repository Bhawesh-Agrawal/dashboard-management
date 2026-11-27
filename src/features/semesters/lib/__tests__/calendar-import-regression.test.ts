import { describe, expect, it } from "vitest";
import { parseCalendarTextDeterministic } from "../calendar-import";

describe("parseCalendarTextDeterministic — Phase 7b bug fixes & regression", () => {
  it("fixes all 4 reported importer bugs (a, b, c, d)", () => {
    const res = parseCalendarTextDeterministic(
      [
        "1 Apr 2027 – 8 Apr 2027: End-Semester Examinations (exam period)",
        "28 Jan 2027 – 4 Feb 2027: Mid-Semester Examinations (exam period)",
        "13 Feb 2027 – 14 Feb 2027: CURA (no classes)",
        "5 Mar 2027 – 6 Mar 2027: Spring Spree (no classes)",
        "Sat 19 Dec 2026 follows Monday timetable",
      ].join("\n"),
      2026
    );

    expect(res.warnings).toEqual([]);
    expect(res.entries).toHaveLength(5);

    expect(res.entries[0]).toMatchObject({
      startDate: "2027-04-01",
      endDate: "2027-04-08",
      title: "End-Semester Examinations",
      kind: "exam_period",
      cancelsClasses: true,
    });
    expect(res.entries[1]).toMatchObject({
      startDate: "2027-01-28",
      endDate: "2027-02-04",
      title: "Mid-Semester Examinations",
      kind: "exam_period",
      cancelsClasses: true,
    });
    expect(res.entries[2]).toMatchObject({
      startDate: "2027-02-13",
      endDate: "2027-02-14",
      title: "CURA",
      kind: "no_classes",
      cancelsClasses: true,
    });
    expect(res.entries[3]).toMatchObject({
      startDate: "2027-03-05",
      endDate: "2027-03-06",
      title: "Spring Spree",
      kind: "no_classes",
      cancelsClasses: true,
    });
    expect(res.entries[4]).toMatchObject({
      startDate: "2026-12-19",
      endDate: "2026-12-19",
      title: "Saturday follows Monday timetable",
      kind: "follows_weekday",
      followsWeekday: 1,
      cancelsClasses: false,
    });
  });

  it("supports hyphen, en/em dash, 'to', full/short months, and day-first numeric dates", () => {
    const res = parseCalendarTextDeterministic(
      [
        "10 - 15 March 2027: Spring Break (break)",
        "28 Jan to 4 Feb 2027 — Mid-Sem Break (break)",
        "26/01/2027: Republic Day",
      ].join("\n"),
      2027
    );

    expect(res.warnings).toEqual([]);
    expect(res.entries[0]).toMatchObject({
      startDate: "2027-03-10",
      endDate: "2027-03-15",
      title: "Spring Break",
      kind: "break",
    });
    expect(res.entries[1]).toMatchObject({
      startDate: "2027-01-28",
      endDate: "2027-02-04",
      title: "Mid-Sem Break",
      kind: "break",
    });
    expect(res.entries[2]).toMatchObject({
      startDate: "2027-01-26",
      endDate: "2027-01-26",
      title: "Republic Day",
      kind: "holiday",
    });
  });

  it("parses full 24-line calendar + 18 key-date note lines regression paste", () => {
    const paste = [
      // 11 holiday / no_classes lines
      "25 Dec 2026: Christmas (holiday)",
      "1 Jan 2027: New Year's Day (holiday)",
      "14 Jan 2027: Makar Sankranti (holiday)",
      "26 Jan 2027: Republic Day (holiday)",
      "13 Feb 2027 – 14 Feb 2027: CURA (no classes)",
      "26 Feb 2027: Maha Shivaratri (holiday)",
      "5 Mar 2027 – 6 Mar 2027: Spring Spree (no classes)",
      "20 Mar 2027: Id-ul-Fitr (holiday)",
      "24 Mar 2027: Holi (holiday)",
      "26 Mar 2027: Good Friday (holiday)",
      "14 Apr 2027: Ambedkar Jayanti (holiday)",
      // 2 exam ranges
      "28 Jan 2027 – 4 Feb 2027: Mid-Semester Examinations (exam period)",
      "1 Apr 2027 – 8 Apr 2027: End-Semester Examinations (exam period)",
      // 11 follows-weekday lines
      "Sat 19 Dec 2026 follows Monday timetable",
      "Sat 2 Jan 2027 follows Tuesday timetable",
      "Sat 9 Jan 2027 follows Wednesday timetable",
      "Sat 23 Jan 2027 follows Thursday timetable",
      "Sat 30 Jan 2027 follows Friday timetable",
      "Sat 6 Feb 2027 follows Monday timetable",
      "Sat 20 Feb 2027 follows Tuesday timetable",
      "Sat 27 Feb 2027 follows Wednesday timetable",
      "Sat 13 Mar 2027 follows Thursday timetable",
      "Sat 27 Mar 2027 follows Friday timetable",
      "Sat 10 Apr 2027 follows Monday timetable",
      // 18 key date note lines
      "Key Dates:",
      "12 Dec 2026 – 17 Dec 2026: Course Registration",
      "18 Dec 2026: Commencement of Classes",
      "22 Dec 2026: Last Date for Add/Drop",
      "15 Jan 2027: Mid-Sem Course Feedback",
      "10 Feb 2027: Mid-Sem Grade Submission",
      "15 Feb 2027: Minor Project Review 1",
      "1 Mar 2027: Pre-Registration Opens",
      "10 Mar 2027: Minor Project Review 2",
      "18 Mar 2027: End-Sem Course Feedback",
      "25 Mar 2027: Attendance Lock Date",
      "30 Mar 2027: Hall Ticket Download",
      "12 Apr 2027 – 9 Jul 2027: Summer Internship Window",
      "15 Apr 2027: End-Sem Grade Submission",
      "20 Apr 2027: Result Declaration",
      "25 Apr 2027: Revaluation Deadline",
      "1 May 2027: Supplementary Exam Registration",
      "3 Jun 2027 – 25 Jun 2027: Supplementary Examinations",
      "30 Jun 2027: Convocation",
    ].join("\n");

    const res = parseCalendarTextDeterministic(paste, 2026);
    expect(res.warnings).toEqual([]);
    expect(res.entries).toHaveLength(42);

    const holidaysAndNoClass = res.entries.slice(0, 11);
    expect(holidaysAndNoClass.every((e) => e.cancelsClasses)).toBe(true);

    const exams = res.entries.slice(11, 13);
    expect(exams.every((e) => e.kind === "exam_period" && e.cancelsClasses)).toBe(true);

    const follows = res.entries.slice(13, 24);
    expect(
      follows.every(
        (e) =>
          e.kind === "follows_weekday" &&
          !e.cancelsClasses &&
          e.title.startsWith("Saturday follows ")
      )
    ).toBe(true);

    const notes = res.entries.slice(24, 42);
    expect(notes).toHaveLength(18);
    expect(notes.every((e) => e.kind === "note" && !e.cancelsClasses)).toBe(true);
    expect(notes[0]).toMatchObject({
      startDate: "2026-12-12",
      endDate: "2026-12-17",
      title: "Course Registration",
    });
    expect(notes[11]).toMatchObject({
      startDate: "2027-04-12",
      endDate: "2027-07-09",
      title: "Summer Internship Window",
    });
    expect(notes[16]).toMatchObject({
      startDate: "2027-06-03",
      endDate: "2027-06-25",
      title: "Supplementary Examinations",
    });
  });
});
