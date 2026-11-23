"use client";

import { useState } from "react";
import {
  createClassSchedule,
  deleteClassSchedule,
  createScheduleException,
  deleteScheduleException,
} from "@/features/schedule/lib/actions";
import { DAY_NAMES } from "@/lib/constants";
import type { ClassSchedule, ScheduleException } from "@prisma/client";
import { Plus, X, CalendarOff, Clock } from "lucide-react";

type ScheduleWithExceptions = ClassSchedule & {
  exceptions?: ScheduleException[];
};

export function ScheduleSection({
  courseId,
  schedules,
}: {
  courseId: string;
  schedules: ScheduleWithExceptions[];
}) {
  const [showForm, setShowForm] = useState(false);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="section-label">Class Schedule</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Plus className="h-3 w-3" />
          Add
        </button>
      </div>

      {showForm && (
        <AddScheduleForm
          courseId={courseId}
          onDone={() => setShowForm(false)}
        />
      )}

      {schedules.length === 0 ? (
        <p className="text-sm text-muted-foreground">No schedule set.</p>
      ) : (
        <div className="space-y-1">
          {schedules.map((schedule) => (
            <ScheduleRow
              key={schedule.id}
              schedule={schedule}
              courseId={courseId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ScheduleRow({
  schedule,
  courseId,
}: {
  schedule: ScheduleWithExceptions;
  courseId: string;
}) {
  const [showException, setShowException] = useState(false);
  const [exceptionLoading, setExceptionLoading] = useState(false);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayException = schedule.exceptions?.find(
    (e) => new Date(e.date).toDateString() === today.toDateString()
  );

  async function handleCancelToday() {
    setExceptionLoading(true);
    await createScheduleException({
      classScheduleId: schedule.id,
      date: today.toISOString().split("T")[0],
      type: "cancelled",
    });
    setExceptionLoading(false);
    setShowException(false);
  }

  async function handleRescheduleToday(newStart: string, newEnd: string) {
    setExceptionLoading(true);
    await createScheduleException({
      classScheduleId: schedule.id,
      date: today.toISOString().split("T")[0],
      type: "rescheduled",
      newStartTime: newStart,
      newEndTime: newEnd,
    });
    setExceptionLoading(false);
    setShowException(false);
  }

  async function handleCancelException() {
    if (!todayException) return;
    setExceptionLoading(true);
    await deleteScheduleException(todayException.id);
    setExceptionLoading(false);
    setShowException(false);
  }

  return (
    <div className="rounded-md border border-border bg-card">
      <div className="flex items-center p-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">
              {DAY_NAMES[schedule.dayOfWeek]}
            </span>
            <span className="text-sm text-muted-foreground">
              {schedule.startTime} — {schedule.endTime}
            </span>
            {todayException?.type === "cancelled" && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground line-through">
                Cancelled
              </span>
            )}
            {todayException?.type === "rescheduled" && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600">
                → {todayException.newStartTime} — {todayException.newEndTime}
              </span>
            )}
          </div>
          {schedule.location && (
            <span className="text-xs text-muted-foreground">
              {schedule.location}
            </span>
          )}
          {schedule.effectiveStartDate && (
            <span className="text-xs text-muted-foreground ml-2">
              · from {new Date(schedule.effectiveStartDate).toLocaleDateString()}
              {schedule.effectiveEndDate && ` — ${new Date(schedule.effectiveEndDate).toLocaleDateString()}`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setShowException(!showException)}
            className="p-1 text-muted-foreground hover:text-amber-500 transition-colors"
            title="Today's exception"
          >
            {todayException ? (
              <CalendarOff className="h-3.5 w-3.5" />
            ) : (
              <Clock className="h-3.5 w-3.5" />
            )}
          </button>
          <form
            action={deleteClassSchedule.bind(null, schedule.id, courseId)}
          >
            <button
              type="submit"
              className="p-1 text-muted-foreground hover:text-destructive transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>
      </div>

      {showException && (
        <div className="px-2 pb-2 border-t border-border">
          <p className="text-xs text-muted-foreground mt-2 mb-1">Today&apos;s class:</p>
          {todayException ? (
            <div className="flex items-center gap-2">
              <span className="text-xs">
                {todayException.type === "cancelled" ? "Cancelled" : `Rescheduled to ${todayException.newStartTime}`}
              </span>
              <button
                onClick={handleCancelException}
                disabled={exceptionLoading}
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                {exceptionLoading ? "..." : "Restore"}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={handleCancelToday}
                disabled={exceptionLoading}
                className="text-xs px-2 py-1 rounded border border-input hover:bg-muted transition-colors"
              >
                {exceptionLoading ? "..." : "Cancel Today"}
              </button>
              <RescheduleButton
                schedule={schedule}
                onReschedule={handleRescheduleToday}
                loading={exceptionLoading}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RescheduleButton({
  schedule,
  onReschedule,
  loading,
}: {
  schedule: ClassSchedule;
  onReschedule: (start: string, end: string) => void;
  loading: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        disabled={loading}
        className="text-xs px-2 py-1 rounded border border-input hover:bg-muted transition-colors"
      >
        Reschedule
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input
        type="time"
        defaultValue={schedule.startTime}
        className="h-6 rounded border border-input bg-background px-1 text-xs"
        id={`reschedule-start-${schedule.id}`}
      />
      <span className="text-xs text-muted-foreground">—</span>
      <input
        type="time"
        defaultValue={schedule.endTime}
        className="h-6 rounded border border-input bg-background px-1 text-xs"
        id={`reschedule-end-${schedule.id}`}
      />
      <button
        onClick={() => {
          const start = (document.getElementById(`reschedule-start-${schedule.id}`) as HTMLInputElement).value;
          const end = (document.getElementById(`reschedule-end-${schedule.id}`) as HTMLInputElement).value;
          onReschedule(start, end);
        }}
        disabled={loading}
        className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90"
      >
        {loading ? "..." : "Set"}
      </button>
      <button
        onClick={() => setOpen(false)}
        className="text-xs text-muted-foreground hover:text-foreground"
      >
        ×
      </button>
    </div>
  );
}

function AddScheduleForm({
  courseId,
  onDone,
}: {
  courseId: string;
  onDone: () => void;
}) {
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);

    await createClassSchedule({
      courseId,
      dayOfWeek: formData.get("dayOfWeek") as ClassSchedule["dayOfWeek"],
      startTime: formData.get("startTime") as string,
      endTime: formData.get("endTime") as string,
      location: (formData.get("location") as string) || undefined,
      effectiveStartDate: (formData.get("effectiveStartDate") as string) || undefined,
      effectiveEndDate: (formData.get("effectiveEndDate") as string) || undefined,
    });

    setLoading(false);
    onDone();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3 p-3 rounded-md border border-border bg-card mb-3">
      <div className="space-y-1">
        <label className="section-label">Day</label>
        <select
          name="dayOfWeek"
          required
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          {Object.entries(DAY_NAMES).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <label className="section-label">Start</label>
        <input
          name="startTime"
          type="time"
          required
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        />
      </div>
      <div className="space-y-1">
        <label className="section-label">End</label>
        <input
          name="endTime"
          type="time"
          required
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        />
      </div>
      <div className="space-y-1">
        <label className="section-label">Location</label>
        <input
          name="location"
          placeholder="Room 204"
          className="h-9 rounded-md border border-input bg-background px-2 text-sm w-32"
        />
      </div>
      <div className="space-y-1">
        <label className="section-label">Active From</label>
        <input
          name="effectiveStartDate"
          type="date"
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        />
      </div>
      <div className="space-y-1">
        <label className="section-label">Active Until</label>
        <input
          name="effectiveEndDate"
          type="date"
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50"
      >
        {loading ? "..." : "Add"}
      </button>
    </form>
  );
}
