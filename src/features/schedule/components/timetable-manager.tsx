"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { DayOfWeek } from "@prisma/client";
import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { deleteClassSchedule } from "@/features/schedule/lib/actions";
import {
  bulkCreateClassSchedulesAction,
  bulkDeleteCourseSchedulesAction,
  updateTimetableSlotAction,
} from "@/features/schedule/lib/timetable-actions";
import {
  addMinutesToHm,
  detectSlotOverlaps,
} from "@/features/schedule/lib/timetable-utils";

export interface TimetableCourseDTO {
  id: string;
  name: string;
  code: string | null;
}

export interface TimetableSlotDTO {
  id: string;
  courseId: string;
  courseName: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  location: string | null;
}

const WEEKDAYS: Array<{ value: DayOfWeek; short: string; full: string }> = [
  { value: "MON", short: "Mon", full: "Monday" },
  { value: "TUE", short: "Tue", full: "Tuesday" },
  { value: "WED", short: "Wed", full: "Wednesday" },
  { value: "THU", short: "Thu", full: "Thursday" },
  { value: "FRI", short: "Fri", full: "Friday" },
  { value: "SAT", short: "Sat", full: "Saturday" },
  { value: "SUN", short: "Sun", full: "Sunday" },
];

const DURATION_PRESETS = [50, 60, 90, 120];

export function TimetableManager({
  semesterId,
  semesterEndDate,
  courses,
  initialSlots,
  importPanel,
}: {
  semesterId: string;
  semesterEndDate: string;
  courses: TimetableCourseDTO[];
  initialSlots: TimetableSlotDTO[];
  importPanel?: React.ReactNode;
}) {
  const router = useRouter();
  const [slots, setSlots] = useState<TimetableSlotDTO[]>(initialSlots);
  const [isPending, startTransition] = useTransition();

  // Add form state
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [selectedDays, setSelectedDays] = useState<DayOfWeek[]>(["MON"]);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [location, setLocation] = useState("");

  // Edit / duplicate state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [duplicatingSlot, setDuplicatingSlot] = useState<TimetableSlotDTO | null>(null);
  const [dupDays, setDupDays] = useState<DayOfWeek[]>([]);
  const [bulkDeleteCourseId, setBulkDeleteCourseId] = useState(courses[0]?.id ?? "");

  const overlapWarnings = useMemo(() => {
    const warnings: string[] = [];
    for (const day of selectedDays) {
      warnings.push(
        ...detectSlotOverlaps({ dayOfWeek: day, startTime, endTime }, slots)
      );
    }
    return warnings;
  }, [selectedDays, startTime, endTime, slots]);

  const groupedByDay = useMemo(() => {
    return WEEKDAYS.map((wd) => ({
      ...wd,
      items: slots
        .filter((s) => s.dayOfWeek === wd.value)
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    })).filter((g) => g.items.length > 0);
  }, [slots]);

  function toggleDay(day: DayOfWeek) {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!courseId || selectedDays.length === 0) return;

    startTransition(async () => {
      try {
        const res = await bulkCreateClassSchedulesAction({
          semesterId,
          courseId,
          daysOfWeek: selectedDays,
          startTime,
          endTime,
          location: location.trim() || null,
          effectiveEndDate: semesterEndDate,
        });
        const courseName = courses.find((c) => c.id === courseId)?.name ?? "Course";
        setSlots((prev) => [
          ...prev,
          ...res.created.map((r) => ({
            id: r.id,
            courseId: r.courseId,
            courseName,
            dayOfWeek: r.dayOfWeek,
            startTime: r.startTime,
            endTime: r.endTime,
            location: r.location,
          })),
        ]);
        setLocation("");
        toast.success(`Added ${res.created.length} class slot${res.created.length === 1 ? "" : "s"}`);
        router.refresh();
      } catch {
        toast.error("Failed to add class slot");
      }
    });
  }

  function handleSaveEdit(slotId: string) {
    startTransition(async () => {
      try {
        await updateTimetableSlotAction(slotId, {
          startTime: editStart,
          endTime: editEnd,
          location: editLocation.trim() || null,
        });
        setSlots((prev) =>
          prev.map((s) =>
            s.id === slotId
              ? { ...s, startTime: editStart, endTime: editEnd, location: editLocation.trim() || null }
              : s
          )
        );
        setEditingId(null);
        toast.success("Slot updated");
        router.refresh();
      } catch {
        toast.error("Failed to update slot");
      }
    });
  }

  function handleDeleteSlot(slotId: string) {
    const target = slots.find((s) => s.id === slotId);
    if (!target) return;
    startTransition(async () => {
      try {
        await deleteClassSchedule(slotId, target.courseId);
        setSlots((prev) => prev.filter((s) => s.id !== slotId));
        toast.success("Slot deleted");
        router.refresh();
      } catch {
        toast.error("Failed to delete slot");
      }
    });
  }

  function handleDuplicateConfirm() {
    if (!duplicatingSlot || dupDays.length === 0) return;
    startTransition(async () => {
      try {
        const res = await bulkCreateClassSchedulesAction({
          semesterId,
          courseId: duplicatingSlot.courseId,
          daysOfWeek: dupDays,
          startTime: duplicatingSlot.startTime,
          endTime: duplicatingSlot.endTime,
          location: duplicatingSlot.location,
          effectiveEndDate: semesterEndDate,
        });
        setSlots((prev) => [
          ...prev,
          ...res.created.map((r) => ({
            id: r.id,
            courseId: r.courseId,
            courseName: duplicatingSlot.courseName,
            dayOfWeek: r.dayOfWeek,
            startTime: r.startTime,
            endTime: r.endTime,
            location: r.location,
          })),
        ]);
        setDuplicatingSlot(null);
        setDupDays([]);
        toast.success(`Duplicated to ${res.created.length} day(s)`);
        router.refresh();
      } catch {
        toast.error("Failed to duplicate slot");
      }
    });
  }

  function handleBulkDeleteCourse() {
    if (!bulkDeleteCourseId) return;
    const cName = courses.find((c) => c.id === bulkDeleteCourseId)?.name ?? "this course";
    if (!confirm(`Delete all timetable slots for ${cName}?`)) return;
    startTransition(async () => {
      try {
        const res = await bulkDeleteCourseSchedulesAction(bulkDeleteCourseId);
        setSlots((prev) => prev.filter((s) => s.courseId !== bulkDeleteCourseId));
        toast.success(`Deleted ${res.deleted} slots for ${cName}`);
        router.refresh();
      } catch {
        toast.error("Failed to delete course schedules");
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Add Class Form */}
      {courses.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-6">
          <EmptyState
            title="Add courses first"
            description="Create or copy courses in this semester before adding weekly timetable slots."
          />
        </div>
      ) : (
        <form
          onSubmit={handleAdd}
          className="rounded-xl border border-border bg-card p-4 space-y-4"
        >
          <h2 className="text-sm font-semibold text-foreground">Add Class</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="space-y-1 text-xs text-muted-foreground">
              <span>Course</span>
              <select
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                className="w-full min-h-[44px] rounded-md border border-border bg-background px-3 text-sm text-foreground"
              >
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.code ? `(${c.code})` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-xs text-muted-foreground">
              <span>Location (optional)</span>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. LH-102"
                className="w-full min-h-[44px] rounded-md border border-border bg-background px-3 text-sm text-foreground"
              />
            </label>
          </div>

          <div className="space-y-1.5">
            <span className="text-xs text-muted-foreground block">Weekdays</span>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((wd) => {
                const active = selectedDays.includes(wd.value);
                return (
                  <button
                    key={wd.value}
                    type="button"
                    onClick={() => toggleDay(wd.value)}
                    className={`px-3 rounded-md border text-xs min-h-[44px] transition-colors ${
                      active
                        ? "bg-foreground text-background border-foreground font-medium"
                        : "bg-background text-muted-foreground border-border hover:text-foreground"
                    }`}
                  >
                    {wd.short}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
            <label className="space-y-1 text-xs text-muted-foreground">
              <span>Start time</span>
              <input
                type="time"
                required
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full min-h-[44px] rounded-md border border-border bg-background px-3 text-sm text-foreground"
              />
            </label>

            <label className="space-y-1 text-xs text-muted-foreground">
              <span>End time</span>
              <input
                type="time"
                required
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full min-h-[44px] rounded-md border border-border bg-background px-3 text-sm text-foreground"
              />
            </label>

            <div className="col-span-2 flex flex-wrap gap-1.5">
              {DURATION_PRESETS.map((mins) => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => setEndTime(addMinutesToHm(startTime, mins))}
                  className="px-2.5 rounded-md border border-border bg-background text-xs text-foreground hover:bg-muted min-h-[44px]"
                >
                  +{mins}m
                </button>
              ))}
            </div>
          </div>

          {overlapWarnings.length > 0 && (
            <div className="rounded-md border border-border bg-muted/50 p-2.5 text-xs text-destructive space-y-0.5">
              {overlapWarnings.map((w, i) => (
                <p key={i}>{w}</p>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              Repeats until {semesterEndDate}
            </span>
            <Button
              type="submit"
              disabled={isPending || selectedDays.length === 0}
              className="min-h-[44px]"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Add class
            </Button>
          </div>
        </form>
      )}

      {importPanel}

      {/* Bulk Delete for One Course */}
      {slots.length > 0 && courses.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-3">
          <span className="text-xs text-muted-foreground">
            Bulk remove all slots for a course:
          </span>
          <div className="flex items-center gap-2">
            <select
              value={bulkDeleteCourseId}
              onChange={(e) => setBulkDeleteCourseId(e.target.value)}
              className="min-h-[44px] rounded-md border border-border bg-background px-2.5 text-xs text-foreground"
            >
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={handleBulkDeleteCourse}
              className="min-h-[44px] text-destructive"
            >
              Delete all
            </Button>
          </div>
        </div>
      )}

      {/* Duplicate Modal Inline */}
      {duplicatingSlot && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <p className="text-sm font-medium text-foreground">
            Duplicate {duplicatingSlot.courseName} ({duplicatingSlot.startTime}–{duplicatingSlot.endTime}) to:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAYS.filter((w) => w.value !== duplicatingSlot.dayOfWeek).map((wd) => {
              const active = dupDays.includes(wd.value);
              return (
                <button
                  key={wd.value}
                  type="button"
                  onClick={() =>
                    setDupDays((prev) =>
                      prev.includes(wd.value)
                        ? prev.filter((d) => d !== wd.value)
                        : [...prev, wd.value]
                    )
                  }
                  className={`px-3 rounded-md border text-xs min-h-[44px] ${
                    active
                      ? "bg-foreground text-background border-foreground"
                      : "bg-background text-muted-foreground border-border"
                  }`}
                >
                  {wd.short}
                </button>
              );
            })}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              disabled={isPending || dupDays.length === 0}
              onClick={handleDuplicateConfirm}
              className="min-h-[44px]"
            >
              Duplicate
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDuplicatingSlot(null)}
              className="min-h-[44px]"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Grouped by Weekday */}
      {groupedByDay.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-6">
          <EmptyState
            title="No timetable slots yet"
            description="Add classes above or import your timetable from CSV/text."
          />
        </div>
      ) : (
        <div className="space-y-4">
          {groupedByDay.map((group) => (
            <div key={group.value} className="space-y-2">
              <h3 className="section-label">{group.full}</h3>
              <ul className="divide-y divide-border rounded-xl border border-border bg-card overflow-hidden">
                {group.items.map((slot) => (
                  <li key={slot.id} className="p-3.5 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {slot.courseName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {slot.startTime}–{slot.endTime}
                          {slot.location ? ` · ${slot.location}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          title="Duplicate to other days"
                          onClick={() => {
                            setDuplicatingSlot(slot);
                            setDupDays([]);
                          }}
                          className="p-2 text-muted-foreground hover:text-foreground min-h-[44px] min-w-[44px] inline-flex items-center justify-center"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          title="Edit slot"
                          onClick={() => {
                            setEditingId(slot.id);
                            setEditStart(slot.startTime);
                            setEditEnd(slot.endTime);
                            setEditLocation(slot.location ?? "");
                          }}
                          className="p-2 text-muted-foreground hover:text-foreground min-h-[44px] min-w-[44px] inline-flex items-center justify-center"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          title="Delete slot"
                          disabled={isPending}
                          onClick={() => handleDeleteSlot(slot.id)}
                          className="p-2 text-muted-foreground hover:text-destructive min-h-[44px] min-w-[44px] inline-flex items-center justify-center"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {editingId === slot.id && (
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 pt-2 border-t border-border">
                        <input
                          type="time"
                          value={editStart}
                          onChange={(e) => setEditStart(e.target.value)}
                          className="min-h-[44px] rounded border border-border bg-background px-2 text-xs text-foreground"
                        />
                        <input
                          type="time"
                          value={editEnd}
                          onChange={(e) => setEditEnd(e.target.value)}
                          className="min-h-[44px] rounded border border-border bg-background px-2 text-xs text-foreground"
                        />
                        <input
                          type="text"
                          value={editLocation}
                          onChange={(e) => setEditLocation(e.target.value)}
                          placeholder="Location"
                          className="min-h-[44px] rounded border border-border bg-background px-2 text-xs text-foreground"
                        />
                        <div className="flex gap-1">
                          <Button
                            type="button"
                            size="sm"
                            disabled={isPending}
                            onClick={() => handleSaveEdit(slot.id)}
                            className="min-h-[44px] flex-1"
                          >
                            Save
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingId(null)}
                            className="min-h-[44px]"
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
