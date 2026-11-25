"use client";

import { useState, useTransition, useEffect, useMemo } from "react";
import { useIsOnline } from "@/lib/use-online";
import { markAttendance } from "@/features/attendance/lib/actions";
import { generateOccurrences, ClassOccurrence } from "@/features/attendance/lib/occurrences";
import {
  computeAttendanceMetrics,
  resolveAttendanceCounts,
  DEFAULT_ATTENDANCE_TARGET_PERCENT,
  AttendanceMetrics,
} from "@/features/attendance/lib/calculations";
import { formatDateOnly } from "@/lib/timezone";
import { toast } from "sonner";
import type { ClassSchedule, ScheduleException, AttendanceRecord, Semester, AttendanceStatus } from "@prisma/client";

interface CourseAttendanceSectionProps {
  courseId: string;
  semester?: Semester | null;
  attendanceMode?: string | null;
  manualPresent?: number | null;
  manualTotalClasses?: number | null;
  schedules: Array<ClassSchedule & { exceptions?: ScheduleException[] }>;
  records: AttendanceRecord[];
}

export function CourseAttendanceSection({
  courseId,
  semester,
  attendanceMode = "auto",
  manualPresent,
  manualTotalClasses,
  schedules,
  records: initialRecords,
}: CourseAttendanceSectionProps) {
  const [records, setRecords] = useState<AttendanceRecord[]>(initialRecords);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [pendingMap, setPendingMap] = useState<Record<string, boolean>>({});
  const isOnline = useIsOnline();

  // Compute semester date range
  const { startDateStr, endDateStr } = useMemo(() => {
    const today = new Date();
    const start = semester?.startDate ? new Date(semester.startDate) : new Date(today.getFullYear(), today.getMonth() - 2, 1);
    let end = semester?.endDate ? new Date(semester.endDate) : new Date(today.getFullYear(), today.getMonth() + 1, 30);

    // Limit end date for occurrences display to today + 14 days so we don't display months of empty future
    const maxFuture = new Date(today);
    maxFuture.setDate(maxFuture.getDate() + 14);
    if (end > maxFuture) {
      end = maxFuture;
    }

    return {
      startDateStr: formatDateOnly(start),
      endDateStr: formatDateOnly(end),
    };
  }, [semester]);

  // Extract all exceptions from schedules
  const allExceptions = useMemo(() => {
    const list: ScheduleException[] = [];
    for (const s of schedules) {
      if (s.exceptions) {
        list.push(...s.exceptions);
      }
    }
    return list;
  }, [schedules]);

  // Generate all occurrences using the pure Occurrence Engine
  const occurrences = useMemo(() => {
    return generateOccurrences({
      schedules,
      exceptions: allExceptions,
      records,
      startDate: startDateStr,
      endDate: endDateStr,
    });
  }, [schedules, allExceptions, records, startDateStr, endDateStr]);

  // Group occurrences by week (Monday to Sunday)
  const groupedWeeks = useMemo(() => {
    const weeks: Array<{
      weekKey: string;
      title: string;
      occurrences: ClassOccurrence[];
    }> = [];

    const weekMap = new Map<string, ClassOccurrence[]>();

    for (const occ of occurrences) {
      const occDate = new Date(`${occ.date}T00:00:00Z`);
      const day = occDate.getUTCDay(); // 0 is Sunday
      // Calculate Monday of this week
      const diffToMon = day === 0 ? -6 : 1 - day;
      const monday = new Date(occDate);
      monday.setUTCDate(occDate.getUTCDate() + diffToMon);
      const weekKey = monday.toISOString().slice(0, 10);

      const list = weekMap.get(weekKey) ?? [];
      list.push(occ);
      weekMap.set(weekKey, list);
    }

    // Sort weeks descending (most recent first)
    const sortedKeys = Array.from(weekMap.keys()).sort((a, b) => b.localeCompare(a));

    for (const key of sortedKeys) {
      const occs = weekMap.get(key)!;
      const monday = new Date(`${key}T00:00:00Z`);
      const sunday = new Date(monday);
      sunday.setUTCDate(monday.getUTCDate() + 6);

      const formatOptions: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
      const title = `${monday.toLocaleDateString("en-US", formatOptions)} - ${sunday.toLocaleDateString("en-US", formatOptions)}`;

      weeks.push({
        weekKey: key,
        title,
        occurrences: occs,
      });
    }

    return weeks;
  }, [occurrences]);

  // Compute metrics (auto or manual)
  const metrics: AttendanceMetrics = useMemo(() => {
    const counts = resolveAttendanceCounts({
      attendanceMode,
      manualPresent,
      manualTotalClasses,
      attendanceRecords: records,
    });
    return computeAttendanceMetrics({
      present: counts.present,
      absent: counts.absent,
      cancelled: counts.cancelled,
      unmarked: counts.unmarked,
      targetPercent: DEFAULT_ATTENDANCE_TARGET_PERCENT,
    });
  }, [attendanceMode, manualPresent, manualTotalClasses, records]);

  // Single marking handler with optimistic update and error rollback
  const handleMark = async (
    occ: ClassOccurrence,
    targetStatus: "present" | "absent" | "cancelled" | "unmarked"
  ) => {
    if (!isOnline) {
      toast.error("Offline — connect to the internet to mark attendance.");
      return;
    }

    const key = occ.occurrenceId;
    setPendingMap((prev) => ({ ...prev, [key]: true }));
    setRowErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });

    // Save previous records for rollback
    const previousRecords = [...records];
    const tempId = `temp-${occ.occurrenceId}`;

    // Optimistically update records
    const existingIndex = records.findIndex(
      (r) =>
        (r.classScheduleId && r.classScheduleId === occ.classScheduleId && formatDateOnly(r.date) === occ.date) ||
        (r.courseId === occ.courseId && formatDateOnly(r.date) === occ.date)
    );

    const dbStatus: AttendanceStatus = targetStatus === "unmarked" ? "not_marked" : targetStatus;

    let nextRecords: AttendanceRecord[];
    if (existingIndex >= 0) {
      nextRecords = [...records];
      nextRecords[existingIndex] = {
        ...nextRecords[existingIndex],
        status: dbStatus,
      };
    } else {
      nextRecords = [
        ...records,
        {
          id: tempId,
          courseId,
          classScheduleId: occ.classScheduleId,
          date: new Date(`${occ.date}T00:00:00Z`),
          status: dbStatus,
        },
      ];
    }
    setRecords(nextRecords);

    try {
      const result = await markAttendance({
        courseId,
        classScheduleId: occ.classScheduleId,
        date: occ.date,
        status: targetStatus,
      });

      // Update with server record
      setRecords((prev) => {
        const withoutTemp = prev.filter((r) => r.id !== tempId);
        const idx = withoutTemp.findIndex(
          (r) =>
            (r.classScheduleId && r.classScheduleId === occ.classScheduleId && formatDateOnly(r.date) === occ.date) ||
            (r.courseId === occ.courseId && formatDateOnly(r.date) === occ.date)
        );
        if (idx >= 0) {
          const updated = [...withoutTemp];
          updated[idx] = {
            ...updated[idx],
            id: result.record.id,
            status: result.record.status,
          };
          return updated;
        }
        return [
          ...withoutTemp,
          {
            id: result.record.id,
            courseId,
            classScheduleId: result.record.classScheduleId,
            date: new Date(`${occ.date}T00:00:00Z`),
            status: result.record.status,
          },
        ];
      });

      toast.success(`Marked ${targetStatus} for ${occ.date}`);
    } catch (err: unknown) {
      setRecords(previousRecords);
      setRowErrors((prev) => ({
        ...prev,
        [key]: "Not saved, tap to retry",
      }));
      toast.error("Failed to save attendance");
    } finally {
      setPendingMap((prev) => ({ ...prev, [key]: false }));
    }
  };

  return (
    <div className="space-y-6">
      {/* Summary Line */}
      <div className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
          <div>
            <h2 className="section-label">Attendance</h2>
            <div className="flex items-baseline gap-2 mt-1">
              <span
                className={`text-3xl font-bold tracking-tight ${
                  metrics.status === "below_target"
                    ? "text-destructive"
                    : "text-foreground"
                }`}
              >
                {metrics.percent}%
              </span>
              <span className="text-xs text-muted-foreground">
                {metrics.present} of {metrics.totalCounted} classes · Target {metrics.targetPercent}%
              </span>
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            {metrics.canMissCount > 0 && (
              <span>
                Can miss {metrics.canMissCount} more{" "}
                {metrics.canMissCount === 1 ? "class" : "classes"}
              </span>
            )}
            {metrics.mustAttendCount > 0 && (
              <span className="text-destructive">
                Must attend next {metrics.mustAttendCount}{" "}
                {metrics.mustAttendCount === 1 ? "class" : "classes"}
              </span>
            )}
          </div>
        </div>

        {!isOnline && (
          <p className="text-xs text-muted-foreground">
            Offline — connect to the internet to mark attendance.
          </p>
        )}
      </div>

      {/* Occurrences Grouped by Week */}
      <div className="space-y-6">
        {groupedWeeks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No class occurrences found for this course schedule.</p>
        ) : (
          groupedWeeks.map((week) => (
            <div key={week.weekKey} className="space-y-2">
              <h3 className="section-label px-1">{week.title}</h3>

              <div className="divide-y divide-border rounded-xl border border-border bg-card overflow-hidden">
                {week.occurrences.map((occ) => {
                  const key = occ.occurrenceId;
                  const isPending = pendingMap[key] || false;
                  const errorMsg = rowErrors[key];
                  const isPastUnmarked = occ.isPast && occ.status === "unmarked";
                  const isCancelledByException = occ.exceptionType === "cancelled";

                  return (
                    <div
                      key={key}
                      className={`p-3.5 sm:px-4 sm:py-3 space-y-2 ${
                        isCancelledByException ? "opacity-60" : ""
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm text-foreground">
                              {occ.dayOfWeek}, {occ.date}
                            </span>
                            {occ.isToday && (
                              <span className="text-xs text-muted-foreground">Today</span>
                            )}
                            {occ.isException && occ.exceptionType === "rescheduled" && (
                              <span className="text-xs text-muted-foreground">Rescheduled</span>
                            )}
                            {isPastUnmarked && (
                              <span className="text-xs text-muted-foreground">Not marked</span>
                            )}
                          </div>

                          <div className="text-xs text-muted-foreground">
                            {occ.startTime} - {occ.endTime}
                            {occ.location ? ` · ${occ.location}` : ""}
                          </div>
                        </div>

                        {isCancelledByException ? (
                          <span className="text-xs text-muted-foreground sm:text-right">
                            Cancelled
                          </span>
                        ) : (
                          <div
                            role="group"
                            aria-label={`Attendance for ${occ.date}`}
                            className="grid grid-cols-3 w-full sm:w-auto sm:inline-grid rounded-md border border-border overflow-hidden divide-x divide-border"
                          >
                            {(["present", "absent", "cancelled"] as const).map((segment) => {
                              const selected = occ.status === segment;
                              const label =
                                segment === "present"
                                  ? "Present"
                                  : segment === "absent"
                                  ? "Absent"
                                  : "Cancelled";
                              return (
                                <button
                                  key={segment}
                                  type="button"
                                  aria-pressed={selected}
                                  onClick={() =>
                                    handleMark(occ, selected ? "unmarked" : segment)
                                  }
                                  disabled={isPending || !isOnline}
                                  className={`min-h-[44px] px-3 text-xs font-medium transition-colors disabled:opacity-50 ${
                                    selected
                                      ? "bg-primary text-primary-foreground"
                                      : "bg-background text-muted-foreground hover:text-foreground hover:bg-muted/50"
                                  }`}
                                >
                                  {label}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {errorMsg && (
                        <div className="flex items-center justify-between text-xs text-destructive">
                          <span>{errorMsg}</span>
                          <button
                            type="button"
                            onClick={() => handleMark(occ, "present")}
                            className="font-medium underline ml-2 min-h-[44px] px-2"
                          >
                            Retry
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
