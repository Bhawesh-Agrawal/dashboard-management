"use client";

import type { DayOfWeek } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  confirmTimetableImportAction,
  parseTimetableWithAiAction,
} from "../lib/timetable-import-actions";
import {
  parseTimetableText,
  type BadTimetableRow,
  type ParsedTimetableSlot,
} from "../lib/timetable-import";
import { detectSlotOverlaps, type TimetableSlotLike } from "../lib/timetable-utils";

const DAY_OPTIONS: Array<{ value: DayOfWeek; label: string }> = [
  { value: "MON", label: "Monday" },
  { value: "TUE", label: "Tuesday" },
  { value: "WED", label: "Wednesday" },
  { value: "THU", label: "Thursday" },
  { value: "FRI", label: "Friday" },
  { value: "SAT", label: "Saturday" },
  { value: "SUN", label: "Sunday" },
];

interface CourseOption {
  id: string;
  name: string;
  code: string | null;
}

interface ReviewRow extends ParsedTimetableSlot {
  matchedCourseId: string | "";
}

export function TimetableImportPanel({
  semesterId,
  courses,
  existingSlots,
}: {
  semesterId: string;
  courses: CourseOption[];
  existingSlots: TimetableSlotLike[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rawText, setRawText] = useState("");
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [badRows, setBadRows] = useState<BadTimetableRow[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);

  function matchCourseId(name: string, code: string | null): string {
    const normName = name.trim().toLowerCase();
    const normCode = code?.trim().toLowerCase();
    const match = courses.find(
      (c) =>
        (normCode && c.code?.trim().toLowerCase() === normCode) ||
        c.name.trim().toLowerCase() === normName ||
        (c.code && normName.includes(c.code.trim().toLowerCase()))
    );
    return match?.id ?? "";
  }

  function applyParseResult(result: {
    slots: ParsedTimetableSlot[];
    badRows: BadTimetableRow[];
    warnings: string[];
  }) {
    setRows(
      result.slots.map((s) => ({
        ...s,
        matchedCourseId: matchCourseId(s.courseName, s.courseCode),
      }))
    );
    setBadRows(result.badRows);
    setWarnings(result.warnings);
  }

  function handleDeterministicParse() {
    const res = parseTimetableText(rawText);
    applyParseResult(res);
  }

  function handleAiParse() {
    startTransition(async () => {
      try {
        const res = await parseTimetableWithAiAction(semesterId, rawText);
        applyParseResult(res);
      } catch {
        toast.error("AI timetable parsing failed");
      }
    });
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setRawText(text);
    applyParseResult(parseTimetableText(text));
  }

  const rowOverlaps = useMemo(() => {
    return rows.map((row, idx) => {
      const peers: TimetableSlotLike[] = [
        ...existingSlots,
        ...rows
          .filter((_, i) => i !== idx)
          .map((r) => ({
            id: r.id,
            dayOfWeek: r.dayOfWeek,
            startTime: r.startTime,
            endTime: r.endTime,
            courseName: r.courseName,
          })),
      ];
      return detectSlotOverlaps(
        {
          id: row.id,
          dayOfWeek: row.dayOfWeek,
          startTime: row.startTime,
          endTime: row.endTime,
          courseName: row.courseName,
        },
        peers
      );
    });
  }, [rows, existingSlots]);

  function updateRow(idx: number, patch: Partial<ReviewRow>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function removeRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleConfirm() {
    if (rows.length === 0) return;
    startTransition(async () => {
      try {
        const res = await confirmTimetableImportAction({
          semesterId,
          rows: rows.map((r) => ({
            courseName: r.courseName,
            courseCode: r.courseCode,
            dayOfWeek: r.dayOfWeek,
            startTime: r.startTime,
            endTime: r.endTime,
            location: r.location,
            matchedCourseId: r.matchedCourseId || null,
          })),
        });
        toast.success(
          `Imported ${res.createdSlots} slot${res.createdSlots === 1 ? "" : "s"}${
            res.createdCourses > 0 ? ` and created ${res.createdCourses} course(s)` : ""
          }`
        );
        setRows([]);
        setBadRows([]);
        setWarnings([]);
        setRawText("");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to import timetable");
      }
    });
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-medium text-foreground">Import timetable</h2>
          <p className="text-xs text-muted-foreground">
            Paste CSV, TSV, or plain text (e.g. Mon 09:00-10:00 CS101 Room 204). Nothing is saved
            until you confirm.
          </p>
        </div>
        <label className="inline-flex items-center rounded-md border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-accent cursor-pointer min-h-[44px]">
          Upload CSV / TXT
          <input
            type="file"
            accept=".csv,.tsv,.txt,text/csv,text/plain"
            onChange={handleFileUpload}
            className="sr-only"
          />
        </label>
      </div>

      <textarea
        value={rawText}
        onChange={(e) => setRawText(e.target.value)}
        rows={5}
        placeholder={"Day,Start,End,Course,Location\nMon,09:00,10:00,Algorithms,LH-1\nWed,9:00 AM,10:00 AM,Algorithms,LH-1"}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground font-mono"
      />

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={handleDeterministicParse}
          disabled={isPending || !rawText.trim()}
          className="min-h-[44px]"
        >
          Parse text / CSV
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={handleAiParse}
          disabled={isPending || !rawText.trim()}
          className="min-h-[44px]"
        >
          Parse with AI
        </Button>
      </div>

      {warnings.length > 0 && (
        <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
          {warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </div>
      )}

      {badRows.length > 0 && (
        <div className="rounded-md border border-border p-3 text-xs space-y-1">
          <p className="font-medium text-destructive">
            Skipped {badRows.length} invalid row{badRows.length === 1 ? "" : "s"}:
          </p>
          <ul className="space-y-1 text-muted-foreground">
            {badRows.map((b, i) => (
              <li key={i}>
                Line {b.lineNumber}: {b.reason} — <span className="font-mono">{b.raw}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {rows.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium text-foreground">
              Review {rows.length} parsed slot{rows.length === 1 ? "" : "s"}
            </h3>
            <Button
              type="button"
              onClick={handleConfirm}
              disabled={isPending}
              className="min-h-[44px]"
            >
              Confirm import ({rows.length})
            </Button>
          </div>

          <div className="space-y-2">
            {rows.map((row, idx) => {
              const conflicts = rowOverlaps[idx] ?? [];
              const createsNewCourse = !row.matchedCourseId;
              return (
                <div
                  key={row.id}
                  className="rounded-md border border-border bg-background p-3 space-y-2"
                >
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-6">
                    <input
                      type="text"
                      value={row.courseName}
                      onChange={(e) => updateRow(idx, { courseName: e.target.value })}
                      aria-label="Course name"
                      className="rounded-md border border-border bg-card px-2 py-1.5 text-sm min-h-[44px]"
                    />
                    <select
                      value={row.matchedCourseId}
                      onChange={(e) => updateRow(idx, { matchedCourseId: e.target.value })}
                      aria-label="Course match"
                      className="rounded-md border border-border bg-card px-2 py-1.5 text-sm min-h-[44px]"
                    >
                      <option value="">Create new course</option>
                      {courses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.code ? `${c.code} · ${c.name}` : c.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={row.dayOfWeek}
                      onChange={(e) =>
                        updateRow(idx, { dayOfWeek: e.target.value as DayOfWeek })
                      }
                      aria-label="Weekday"
                      className="rounded-md border border-border bg-card px-2 py-1.5 text-sm min-h-[44px]"
                    >
                      {DAY_OPTIONS.map((d) => (
                        <option key={d.value} value={d.value}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="time"
                      value={row.startTime}
                      onChange={(e) => updateRow(idx, { startTime: e.target.value })}
                      aria-label="Start time"
                      className="rounded-md border border-border bg-card px-2 py-1.5 text-sm min-h-[44px]"
                    />
                    <input
                      type="time"
                      value={row.endTime}
                      onChange={(e) => updateRow(idx, { endTime: e.target.value })}
                      aria-label="End time"
                      className="rounded-md border border-border bg-card px-2 py-1.5 text-sm min-h-[44px]"
                    />
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={row.location ?? ""}
                        placeholder="Room"
                        onChange={(e) => updateRow(idx, { location: e.target.value || null })}
                        aria-label="Location"
                        className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm min-h-[44px]"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => removeRow(idx)}
                        className="min-h-[44px] shrink-0 text-destructive"
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {createsNewCourse && (
                      <span className="rounded border border-border px-2 py-0.5 text-muted-foreground">
                        Creates new course: {row.courseName}
                      </span>
                    )}
                    {row.lowConfidence && (
                      <span className="rounded border border-border px-2 py-0.5 text-muted-foreground">
                        Low confidence — verify
                      </span>
                    )}
                    {conflicts.map((c, ci) => (
                      <span key={ci} className="text-destructive">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
