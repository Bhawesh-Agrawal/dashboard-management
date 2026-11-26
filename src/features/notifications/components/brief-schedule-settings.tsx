"use client";

import { useState, useTransition } from "react";
import {
  saveBriefScheduleSettingsAction,
  type BriefScheduleSettingsData,
} from "@/features/notifications/lib/actions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

function isTimeInQuietWindow(timeHm: string, startHm: string, endHm: string): boolean {
  const [th, tm] = timeHm.split(":").map(Number);
  const [sh, sm] = startHm.split(":").map(Number);
  const [eh, em] = endHm.split(":").map(Number);
  if ([th, tm, sh, sm, eh, em].some(Number.isNaN)) return false;
  const t = th * 60 + tm;
  const s = sh * 60 + sm;
  const e = eh * 60 + em;
  if (s <= e) return t >= s && t < e;
  return t >= s || t < e;
}

export function BriefScheduleSettings({
  initial,
}: {
  initial: BriefScheduleSettingsData;
}) {
  const [form, setForm] = useState<BriefScheduleSettingsData>(initial);
  const [isPending, startTransition] = useTransition();

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await saveBriefScheduleSettingsAction(form);
      if (res.success) {
        toast.success("Brief & reminder schedule saved");
      } else {
        toast.error("Failed to save schedule settings");
      }
    });
  }

  const morningInQuiet =
    form.morningEnabled &&
    isTimeInQuietWindow(form.morningTime, form.quietHoursStart, form.quietHoursEnd);
  const eveningInQuiet =
    form.eveningEnabled &&
    isTimeInQuietWindow(form.eveningTime, form.quietHoursStart, form.quietHoursEnd);

  return (
    <form
      onSubmit={handleSave}
      className="rounded-xl border border-border bg-card p-4 space-y-4 max-w-xl"
    >
      <div>
        <h3 className="text-sm font-semibold text-foreground">
          Briefs &amp; Reminder Timing
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Configure morning/evening brief times, lead times, and quiet hours.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-lg border border-border p-3 space-y-2">
          <label className="flex items-center justify-between gap-2 text-xs font-medium text-foreground min-h-[44px]">
            <span>Morning Brief</span>
            <input
              type="checkbox"
              checked={form.morningEnabled}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, morningEnabled: e.target.checked }))
              }
              className="h-4 w-4"
            />
          </label>
          <input
            type="time"
            value={form.morningTime}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, morningTime: e.target.value }))
            }
            className="w-full min-h-[44px] rounded-md border border-border bg-background px-3 text-sm text-foreground"
          />
        </div>

        <div className="rounded-lg border border-border p-3 space-y-2">
          <label className="flex items-center justify-between gap-2 text-xs font-medium text-foreground min-h-[44px]">
            <span>Evening Brief</span>
            <input
              type="checkbox"
              checked={form.eveningEnabled}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, eveningEnabled: e.target.checked }))
              }
              className="h-4 w-4"
            />
          </label>
          <input
            type="time"
            value={form.eveningTime}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, eveningTime: e.target.value }))
            }
            className="w-full min-h-[44px] rounded-md border border-border bg-background px-3 text-sm text-foreground"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="space-y-1 text-xs text-muted-foreground">
          <span>Class reminder (minutes before)</span>
          <input
            type="number"
            min={0}
            max={60}
            value={form.classReminderMinutes}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                classReminderMinutes: Number(e.target.value) || 0,
              }))
            }
            className="w-full min-h-[44px] rounded-md border border-border bg-background px-3 text-sm text-foreground"
          />
        </label>

        <label className="space-y-1 text-xs text-muted-foreground">
          <span>Event reminder (minutes before)</span>
          <input
            type="number"
            min={0}
            max={120}
            value={form.eventReminderMinutes}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                eventReminderMinutes: Number(e.target.value) || 0,
              }))
            }
            className="w-full min-h-[44px] rounded-md border border-border bg-background px-3 text-sm text-foreground"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1 text-xs text-muted-foreground">
          <span>Quiet hours start</span>
          <input
            type="time"
            value={form.quietHoursStart}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, quietHoursStart: e.target.value }))
            }
            className="w-full min-h-[44px] rounded-md border border-border bg-background px-3 text-sm text-foreground"
          />
        </label>

        <label className="space-y-1 text-xs text-muted-foreground">
          <span>Quiet hours end</span>
          <input
            type="time"
            value={form.quietHoursEnd}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, quietHoursEnd: e.target.value }))
            }
            className="w-full min-h-[44px] rounded-md border border-border bg-background px-3 text-sm text-foreground"
          />
        </label>
      </div>

      {(morningInQuiet || eveningInQuiet) && (
        <p className="text-xs text-destructive">
          {morningInQuiet && eveningInQuiet
            ? "Morning and evening brief times fall inside quiet hours"
            : morningInQuiet
            ? "Morning brief time falls inside quiet hours"
            : "Evening brief time falls inside quiet hours"}{" "}
          — delivery will wait until quiet hours end ({form.quietHoursEnd}).
        </p>
      )}

      <Button type="submit" disabled={isPending} className="min-h-[44px]">
        {isPending ? "Saving..." : "Save Schedule"}
      </Button>
    </form>
  );
}
