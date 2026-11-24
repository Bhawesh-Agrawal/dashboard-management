"use client";

import { useState, useTransition, useEffect } from "react";
import { useIsOnline } from "@/lib/use-online";
import { markAttendance } from "@/features/attendance/lib/actions";
import { Check, X, Ban, AlertTriangle, RotateCcw, WifiOff, MapPin, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import type { DashboardData } from "@/types";

type ClassItem = DashboardData["todayClasses"][number];

interface ClassOccurrenceState {
  status: "present" | "absent" | "cancelled" | "unmarked";
  error: string | null;
  pending: boolean;
}

export function TodayClassesCard({
  todayClasses,
}: {
  todayClasses: ClassItem[];
}) {
  const isOnline = useIsOnline();
  const [rowStates, setRowStates] = useState<Record<string, ClassOccurrenceState>>({});
  const [bulkPending, startBulkTransition] = useTransition();

  // Initialize row states from initial data
  useEffect(() => {
    const initial: Record<string, ClassOccurrenceState> = {};
    for (const cls of todayClasses) {
      const clsAny = cls as unknown as {
        exceptions?: Array<{ type: string }>;
        attendanceRecords?: Array<{ status: string }>;
      };
      let status: "present" | "absent" | "cancelled" | "unmarked" = "unmarked";
      if (clsAny.exceptions?.[0]?.type === "cancelled") {
        status = "cancelled";
      } else if (clsAny.attendanceRecords?.[0]?.status) {
        const s = clsAny.attendanceRecords[0].status;
        if (s === "present" || s === "absent" || s === "cancelled") {
          status = s;
        }
      }
      initial[cls.id] = {
        status,
        error: null,
        pending: false,
      };
    }
    setRowStates(initial);
  }, [todayClasses]);

  const handleMark = async (
    cls: ClassItem,
    targetStatus: "present" | "absent" | "cancelled"
  ) => {
    if (!isOnline) {
      toast.error("Offline — connect to the internet to mark attendance.");
      return;
    }

    const previousStatus = rowStates[cls.id]?.status ?? "unmarked";

    // Optimistic update
    setRowStates((prev) => ({
      ...prev,
      [cls.id]: {
        status: targetStatus,
        error: null,
        pending: true,
      },
    }));

    try {
      const todayStr = new Date().toISOString().slice(0, 10);
      await markAttendance({
        courseId: cls.course.id,
        classScheduleId: cls.id,
        date: todayStr,
        status: targetStatus,
      });

      setRowStates((prev) => ({
        ...prev,
        [cls.id]: {
          status: targetStatus,
          error: null,
          pending: false,
        },
      }));
      toast.success(`Marked ${targetStatus} for ${cls.course.name}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save attendance";
      setRowStates((prev) => ({
        ...prev,
        [cls.id]: {
          status: previousStatus,
          error: "Not saved, tap to retry",
          pending: false,
        },
      }));
      toast.error(`Attendance update failed: ${msg}`);
    }
  };

  const handleMarkAllPresent = () => {
    if (!isOnline) {
      toast.error("Offline — connect to the internet to mark attendance.");
      return;
    }

    startBulkTransition(async () => {
      try {
        const todayStr = new Date().toISOString().slice(0, 10);
        // Optimistically set all to present
        const nextStates: Record<string, ClassOccurrenceState> = { ...rowStates };
        for (const cls of todayClasses) {
          nextStates[cls.id] = { status: "present", error: null, pending: true };
        }
        setRowStates(nextStates);

        // Call markAttendance for each today class
        await Promise.all(
          todayClasses.map((cls) =>
            markAttendance({
              courseId: cls.course.id,
              classScheduleId: cls.id,
              date: todayStr,
              status: "present",
            })
          )
        );

        const finalized: Record<string, ClassOccurrenceState> = {};
        for (const cls of todayClasses) {
          finalized[cls.id] = { status: "present", error: null, pending: false };
        }
        setRowStates(finalized);
        toast.success("All classes today marked present!");
      } catch (err) {
        toast.error("Failed to mark all classes present");
      }
    });
  };

  if (todayClasses.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-5 text-center">
        <h3 className="text-base font-semibold text-foreground mb-1">Today&apos;s Classes</h3>
        <p className="text-sm text-muted-foreground">No classes scheduled for today.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5 shadow-sm space-y-4">
      {/* Header and Quick Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-border">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-foreground">Today&apos;s Classes</h2>
          <p className="text-xs text-muted-foreground">
            {todayClasses.length} {todayClasses.length === 1 ? "class" : "classes"} scheduled
          </p>
        </div>
        <button
          onClick={handleMarkAllPresent}
          disabled={bulkPending || !isOnline}
          className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3.5 py-2 text-xs font-medium rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
        >
          <CheckCheck className="h-4 w-4" />
          <span>Mark all today present</span>
        </button>
      </div>

      {/* Offline Alert Banner */}
      {!isOnline && (
        <div className="flex items-center gap-2 p-3 text-xs rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400">
          <WifiOff className="h-4 w-4 shrink-0" />
          <span>You are offline. Connect to internet to mark attendance.</span>
        </div>
      )}

      {/* Class Rows */}
      <div className="divide-y divide-border/60">
        {todayClasses.map((cls) => {
          const state = rowStates[cls.id] || {
            status: "unmarked",
            error: null,
            pending: false,
          };
          const clsAny = cls as unknown as {
            exceptions?: Array<{ type: string; newStartTime?: string; newEndTime?: string; newLocation?: string }>;
          };
          const exception = clsAny.exceptions?.[0];
          const isRescheduled = exception?.type === "rescheduled";
          const startTime = isRescheduled && exception.newStartTime ? exception.newStartTime : cls.startTime;
          const endTime = isRescheduled && exception.newEndTime ? exception.newEndTime : cls.endTime;
          const location = isRescheduled && exception.newLocation ? exception.newLocation : cls.location;

          return (
            <div key={cls.id} className="py-3.5 first:pt-0 last:pb-0 space-y-3">
              {/* Class Info */}
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: cls.course.color || "hsl(var(--primary))" }}
                    />
                    <Link
                      href={`/courses/${cls.course.id}`}
                      className="font-medium text-sm hover:underline truncate"
                    >
                      {cls.course.name}
                    </Link>
                    {cls.course.code && (
                      <span className="text-xs text-muted-foreground font-mono">
                        ({cls.course.code})
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{startTime} - {endTime}</span>
                    {location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {location}
                      </span>
                    )}
                  </div>
                </div>

                {/* Status Badge */}
                <div>
                  {state.status === "present" && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                      <Check className="h-3 w-3" /> Present
                    </span>
                  )}
                  {state.status === "absent" && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400">
                      <X className="h-3 w-3" /> Absent
                    </span>
                  )}
                  {state.status === "cancelled" && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                      <Ban className="h-3 w-3" /> Cancelled
                    </span>
                  )}
                  {state.status === "unmarked" && (
                    <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full border border-dashed border-border text-muted-foreground">
                      Unmarked
                    </span>
                  )}
                </div>
              </div>

              {/* Error banner if save failed */}
              {state.error && (
                <div className="flex items-center justify-between p-2 rounded bg-destructive/10 border border-destructive/20 text-destructive text-xs">
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <span>{state.error}</span>
                  </div>
                  <button
                    onClick={() => handleMark(cls, state.status !== "unmarked" ? state.status : "present")}
                    className="inline-flex items-center gap-1 font-medium hover:underline ml-2"
                  >
                    <RotateCcw className="h-3 w-3" /> Retry
                  </button>
                </div>
              )}

              {/* Action Buttons: Min 44px height, responsive */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handleMark(cls, "present")}
                  disabled={state.pending || !isOnline}
                  className={`min-h-[44px] flex items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-all ${
                    state.status === "present"
                      ? "bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-600/30"
                      : "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/50 hover:bg-emerald-100"
                  }`}
                >
                  <Check className="h-4 w-4" />
                  <span>Present</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleMark(cls, "absent")}
                  disabled={state.pending || !isOnline}
                  className={`min-h-[44px] flex items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-all ${
                    state.status === "absent"
                      ? "bg-rose-600 text-white shadow-sm ring-2 ring-rose-600/30"
                      : "bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-900/50 hover:bg-rose-100"
                  }`}
                >
                  <X className="h-4 w-4" />
                  <span>Absent</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleMark(cls, "cancelled")}
                  disabled={state.pending || !isOnline}
                  className={`min-h-[44px] flex items-center justify-center gap-1.5 rounded-lg text-xs font-medium transition-all ${
                    state.status === "cancelled"
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
  );
}
