"use client";

import { useState, useTransition, useEffect } from "react";
import { useIsOnline } from "@/lib/use-online";
import { markAttendance } from "@/features/attendance/lib/actions";
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
    targetStatus: "present" | "absent" | "cancelled" | "unmarked"
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
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-4">
      {/* Header and Quick Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-border">
        <div>
          <h2 className="section-label">Today&apos;s Classes</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {todayClasses.length} {todayClasses.length === 1 ? "class" : "classes"} scheduled
          </p>
        </div>
        <button
          type="button"
          onClick={handleMarkAllPresent}
          disabled={bulkPending || !isOnline}
          className="inline-flex items-center justify-center min-h-[44px] px-3 py-2 text-xs font-medium rounded-md border border-border bg-background text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50"
        >
          Mark all today present
        </button>
      </div>

      {/* Offline Notice */}
      {!isOnline && (
        <p className="text-xs text-muted-foreground">
          Offline — connect to the internet to mark attendance.
        </p>
      )}

      {/* Class Rows */}
      <div className="divide-y divide-border">
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
          const isCancelledByException = exception?.type === "cancelled";

          return (
            <div
              key={cls.id}
              className={`py-3 first:pt-0 last:pb-0 space-y-2 ${
                isCancelledByException ? "opacity-60" : ""
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      href={`/courses/${cls.course.id}`}
                      className="font-medium text-sm text-foreground hover:underline truncate"
                    >
                      {cls.course.name}
                    </Link>
                    {cls.course.code && (
                      <span className="text-xs text-muted-foreground">
                        {cls.course.code}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {startTime} - {endTime}
                    {location ? ` · ${location}` : ""}
                  </div>
                </div>

                {isCancelledByException ? (
                  <span className="text-xs text-muted-foreground sm:text-right">
                    Cancelled
                  </span>
                ) : (
                  <div
                    role="group"
                    aria-label={`Attendance for ${cls.course.name}`}
                    className="grid grid-cols-3 w-full sm:w-auto sm:inline-grid rounded-md border border-border overflow-hidden divide-x divide-border"
                  >
                    {(["present", "absent", "cancelled"] as const).map((segment) => {
                      const selected = state.status === segment;
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
                            handleMark(cls, selected ? "unmarked" : segment)
                          }
                          disabled={state.pending || !isOnline}
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

              {state.error && (
                <div className="flex items-center justify-between text-xs text-destructive">
                  <span>{state.error}</span>
                  <button
                    type="button"
                    onClick={() => handleMark(cls, state.status !== "unmarked" ? state.status : "present")}
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
  );
}
