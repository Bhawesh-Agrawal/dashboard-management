"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import {
  saveBriefScheduleSettingsAction,
  type BriefScheduleSettingsData,
} from "@/features/notifications/lib/actions";
import type { BriefCardId } from "@/features/briefs/lib/payload-v2";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const CARD_LABELS: Record<BriefCardId, string> = {
  nextUp: "Next Up",
  weather: "Weather & Air Quality",
  timeline: "Timeline",
  deadlines: "Deadlines",
  travel: "Travel & Tickets",
  study: "DSA & Study",
  notes: "Recent Notes",
  nudges: "Setup Nudges",
  quickActions: "Quick Actions",
};

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

  function moveCard(index: number, delta: -1 | 1) {
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= form.cardOrder.length) return;
    const nextOrder = [...form.cardOrder];
    const [moved] = nextOrder.splice(index, 1);
    nextOrder.splice(nextIndex, 0, moved);
    setForm((prev) => ({ ...prev, cardOrder: nextOrder }));
  }

  function toggleCard(cardId: BriefCardId, checked: boolean) {
    setForm((prev) => {
      const set = new Set(prev.enabledCards);
      if (checked) set.add(cardId);
      else set.delete(cardId);
      return { ...prev, enabledCards: Array.from(set) };
    });
  }

  const morningInQuiet =
    form.morningEnabled &&
    isTimeInQuietWindow(form.morningTime, form.quietHoursStart, form.quietHoursEnd);
  const middayInQuiet =
    form.middayEnabled &&
    isTimeInQuietWindow(form.middayTime, form.quietHoursStart, form.quietHoursEnd);
  const eveningInQuiet =
    form.eveningEnabled &&
    isTimeInQuietWindow(form.eveningTime, form.quietHoursStart, form.quietHoursEnd);

  return (
    <form
      onSubmit={handleSave}
      className="rounded-xl border border-border bg-card p-4 space-y-5 max-w-xl"
    >
      <div>
        <h3 className="text-sm font-semibold text-foreground">
          Briefs &amp; Reminder Timing
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Configure morning/midday/evening brief times, AI phrasing, AQI, card order, and quiet hours.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
            <span>Midday Brief</span>
            <input
              type="checkbox"
              checked={form.middayEnabled}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, middayEnabled: e.target.checked }))
              }
              className="h-4 w-4"
            />
          </label>
          <input
            type="time"
            value={form.middayTime}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, middayTime: e.target.value }))
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

      {/* Brief v2 Content Options */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="flex items-center justify-between gap-2 rounded-lg border border-border p-3 text-xs font-medium text-foreground min-h-[44px]">
          <span>AI headline &amp; summary</span>
          <input
            type="checkbox"
            checked={form.aiHeadline}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, aiHeadline: e.target.checked }))
            }
            className="h-4 w-4"
          />
        </label>

        <label className="flex items-center justify-between gap-2 rounded-lg border border-border p-3 text-xs font-medium text-foreground min-h-[44px]">
          <span>Air quality (US AQI)</span>
          <input
            type="checkbox"
            checked={form.includeAqi}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, includeAqi: e.target.checked }))
            }
            className="h-4 w-4"
          />
        </label>
      </div>

      {/* Card Order & Visibility */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-foreground">
          Brief Cards (enable &amp; reorder)
        </p>
        <ul className="divide-y divide-border rounded-lg border border-border bg-background">
          {form.cardOrder.map((cardId, idx) => {
            const enabled = form.enabledCards.includes(cardId);
            return (
              <li
                key={cardId}
                className="flex items-center justify-between gap-2 px-3 py-1.5"
              >
                <label className="flex items-center gap-2.5 text-xs text-foreground min-h-[44px] flex-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => toggleCard(cardId, e.target.checked)}
                    className="h-4 w-4"
                  />
                  <span>{CARD_LABELS[cardId]}</span>
                </label>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => moveCard(idx, -1)}
                    disabled={idx === 0}
                    aria-label={`Move ${CARD_LABELS[cardId]} up`}
                    className="p-2 rounded border border-border text-muted-foreground hover:text-foreground disabled:opacity-40 min-h-[44px] min-w-[44px] inline-flex items-center justify-center"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveCard(idx, 1)}
                    disabled={idx === form.cardOrder.length - 1}
                    aria-label={`Move ${CARD_LABELS[cardId]} down`}
                    className="p-2 rounded border border-border text-muted-foreground hover:text-foreground disabled:opacity-40 min-h-[44px] min-w-[44px] inline-flex items-center justify-center"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
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

      {(morningInQuiet || middayInQuiet || eveningInQuiet) && (
        <p className="text-xs text-destructive">
          A configured brief time falls inside quiet hours — delivery will wait until quiet hours end ({form.quietHoursEnd}).
        </p>
      )}

      <Button type="submit" disabled={isPending} className="min-h-[44px]">
        {isPending ? "Saving..." : "Save Schedule"}
      </Button>
    </form>
  );
}
