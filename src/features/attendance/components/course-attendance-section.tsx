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
import { Check, X, Ban, AlertTriangle, RotateCcw, WifiOff, Calendar, MapPin, TrendingUp, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import type { ClassSchedule, ScheduleException, AttendanceRecord, Semester } from "@prisma/client";

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
    targetStatus: "present" | "absent" | "cancelled"
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

    let nextRecords: AttendanceRecord[];
    if (existingIndex >= 0) {
      nextRecords = [...records];
      nextRecords[existingIndex] = {
        ...nextRecords[existingIndex],
        status: targetStatus,
      };
    } else {
      nextRecords = [
        ...records,
        {
          id: tempId,
          courseId,
          classScheduleId: occ.classScheduleId,
          date: new Date(`${occ.date}T00:00:00Z`),
          status: targetStatus,
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
      {/* Top Section: Metrics and Academic Buffer / Recovery Forecast */}
      <div className="rounded-xl border border-border bg-card p-4 sm:p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border">
          <div>
            <h2 className="section-label">Attendance</h2>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl font-bold tracking-tight text-foreground">
                {metrics.percent}%
              </span>
              <span className="text-xs text-muted-foreground">
                ({metrics.present} of {metrics.totalCounted} classes counted)
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                metrics.status === "above_target"
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                  : metrics.status === "at_target"
                  ? "bg-primary/10 text-primary"
                  : "bg-rose-500/15 text-rose-600 dark:text-rose-400"
              }`}
            >
              Target: {metrics.targetPercent}%
            </span>
          </div>
        </div>

        {/* Academic Forecasting Card */}
        {metrics.canMissCount > 0 && (
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-xs sm:text-sm">
            <TrendingUp className="h-4 w-4 mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div>
              <span className="font-semibold">Buffer available: </span>
              <span>
                You can miss <strong>{metrics.canMissCount}</strong> more{" "}
                {metrics.canMissCount === 1 ? "class" : "classes"} and remain above the {metrics.targetPercent}% target.
              </span>
            </div>
          </div>
        )}

        {metrics.mustAttendCount > 0 && (
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-800 dark:text-rose-300 text-xs sm:text-sm">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-rose-600 dark:text-rose-400" />
            <div>
              <span className="font-semibold">Attendance alert: </span>
              <span>
                You must attend the next <strong>{metrics.mustAttendCount}</strong> consecutive{" "}
                {metrics.mustAttendCount === 1 ? "class" : "classes"} to recover to {metrics.targetPercent}%.
              </span>
            </div>
          </div>
        )}

        {/* Offline Warning */}
        {!isOnline && (
          <div className="flex items-center gap-2 p-3 text-xs rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400">
            <WifiOff className="h-4 w-4 shrink-0" />
            <span>You are offline. Connect to internet to mark attendance.</span>
          </div>
        )}
      </div>

      {/* Occurrences Grouped by Week */}
      <div className="space-y-6">
        {groupedWeeks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No class occurrences found for this course schedule.</p>
        ) : (
          groupedWeeks.map((week) => (
            <div key={week.weekKey} className="space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
                <Calendar className="h-3.5 w-3.5" />
                <span>{week.title}</span>
              </div>

              <div className="rounded-xl border border-border bg-card divide-y divide-border/60 overflow-hidden shadow-sm">
                {week.occurrences.map((occ) => {
                  const key = occ.occurrenceId;
                  const isPending = pendingMap[key] || false;
                  const errorMsg = rowErrors[key];
                  const isPastUnmarked = occ.isPast && occ.status === "unmarked";

                  return (
                    <div
                      key={key}
                      className={`p-3.5 sm:p-4 space-y-3 transition-colors ${
                        isPastUnmarked ? "bg-amber-500/5 dark:bg-amber-500/10" : ""
                      }`}
                    >
                      {/* Occurrence Details Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm text-foreground">
                              {occ.dayOfWeek}, {occ.date}
                            </span>
                            {occ.isToday && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/15 text-primary">
                                TODAY
                              </span>
                            )}
                            {occ.isException && occ.exceptionType === "rescheduled" && (
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-600 dark:text-blue-400">
                                Rescheduled
                              </span>
                            )}
                            {isPastUnmarked && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40">
                                <AlertTriangle className="h-3 w-3" />
                                Unmarked past class
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>
                              {occ.startTime} - {occ.endTime}
                            </span>
                            {occ.location && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {occ.location}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Current Status Pill */}
                        <div>
                          {occ.status === "present" && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                              <Check className="h-3 w-3" /> Present
                            </span>
                          )}
                          {occ.status === "absent" && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400">
                              <X className="h-3 w-3" /> Absent
                            </span>
                          )}
                          {occ.status === "cancelled" && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                              <Ban className="h-3 w-3" /> Cancelled
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Error state */}
                      {errorMsg && (
                        <div className="flex items-center justify-between p-2 rounded bg-destructive/10 border border-destructive/20 text-destructive text-xs">
                          <div className="flex items-center gap-1.5">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            <span>{errorMsg}</span>
                          </div>
                          <button
                            onClick={() => handleMark(occ, "present")}
                            className="inline-flex items-center gap-1 font-medium hover:underline ml-2"
                          >
                            <RotateCcw className="h-3 w-3" /> Retry
                          </button>
                        </div>
                      )}

                      {/* Large One-Tap Buttons: Min 44px height */}
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => handleMark(occ, "present")}
                          disabled={isPending || !isOnline}
                          className={`min-h-[44px] flex items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-all ${
                            occ.status === "present"
                              ? "bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-600/30"
                              : "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/50 hover:bg-emerald-100"
                          }`}
                        >
                          <Check className="h-4 w-4" />
                          <span>Present</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleMark(occ, "absent")}
                          disabled={isPending || !isOnline}
                          className={`min-h-[44px] flex items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-all ${
                            occ.status === "absent"
                              ? "bg-rose-600 text-white shadow-sm ring-2 ring-rose-600/30"
                              : "bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-900/50 hover:bg-rose-100"
                          }`}
                        >
                          <X className="h-4 w-4" />
                          <span>Absent</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleMark(occ, "cancelled")}
                          disabled={isPending || !isOnline}
                          className={`min-h-[44px] flex items-center justify-center gap-1.5 rounded-lg text-xs font-medium transition-all ${
                            occ.status === "cancelled"
                              ? "bg-slate-700 text-white shadow-sm ring-2 ring-slate-700/30 dark:bg-slate-600"
                              : "bg-muted/70 text-muted-foreground border border-border hover:bg-muted"
                          }`}
                        >
                          <Ban className="h-3.5 w-3.5" />
                          <span>Cancelled</span>
                        </button>
                      </div>
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
