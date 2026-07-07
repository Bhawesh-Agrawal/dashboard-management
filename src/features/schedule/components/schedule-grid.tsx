"use client";

import { useState } from "react";
import { createClassSchedule, deleteClassSchedule } from "@/features/schedule/lib/actions";
import { DAY_NAMES } from "@/lib/constants";
import type { ClassSchedule } from "@prisma/client";
import { Plus, X } from "lucide-react";

export function ScheduleSection({
  courseId,
  schedules,
}: {
  courseId: string;
  schedules: ClassSchedule[];
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
            <div key={schedule.id} className="list-row items-center">
              <div className="flex-1">
                <span className="text-sm font-medium">
                  {DAY_NAMES[schedule.dayOfWeek]}
                </span>
                <span className="text-sm text-muted-foreground ml-2">
                  {schedule.startTime} — {schedule.endTime}
                </span>
                {schedule.location && (
                  <span className="text-xs text-muted-foreground ml-2">
                    · {schedule.location}
                  </span>
                )}
              </div>
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
          ))}
        </div>
      )}
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
