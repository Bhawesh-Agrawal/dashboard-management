"use client";

import { useState } from "react";
import { createRoutine } from "@/features/routines/lib/actions";
import { DAY_NAMES } from "@/lib/constants";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import type { Identity } from "@prisma/client";

export function CreateRoutineDialog({ identities }: { identities?: Identity[] }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedDays, setSelectedDays] = useState<string[]>([]);

  function toggleDay(day: string) {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);

    await createRoutine({
      name: formData.get("name") as string,
      timeOfDay: formData.get("timeOfDay") as "morning" | "afternoon" | "evening" | "anytime",
      specificTime: (formData.get("specificTime") as string) || undefined,
      activeDays: selectedDays as ("MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN")[],
      identityId: (formData.get("identityId") as string) || null,
    });

    setLoading(false);
    setOpen(false);
    setSelectedDays([]);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<button className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors" />}>
          <Plus className="h-4 w-4" />
          New Routine
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">New Routine</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <label htmlFor="name" className="section-label">
              Name
            </label>
            <input
              id="name"
              name="name"
              required
              placeholder="e.g. Review today's lecture notes"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label htmlFor="timeOfDay" className="section-label">
                Time of Day
              </label>
              <select
                id="timeOfDay"
                name="timeOfDay"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="morning">Morning</option>
                <option value="afternoon">Afternoon</option>
                <option value="evening">Evening</option>
                <option value="anytime">Anytime</option>
              </select>
            </div>
            <div className="space-y-2">
              <label htmlFor="specificTime" className="section-label">
                Specific Time
              </label>
              <input
                id="specificTime"
                name="specificTime"
                type="time"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              <p className="text-[0.6rem] text-muted-foreground uppercase">
                Optional — for push notifications
              </p>
            </div>
          </div>
          {identities && identities.length > 0 && (
            <div className="space-y-2">
              <label htmlFor="identityId" className="section-label">
                Reinforces Identity
              </label>
              <select
                id="identityId"
                name="identityId"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">None</option>
                {identities.map((identity) => (
                  <option key={identity.id} value={identity.id}>
                    {identity.statement}
                  </option>
                ))}
              </select>
              <p className="text-[0.6rem] text-muted-foreground uppercase">
                Optional — who does this make you become?
              </p>
            </div>
          )}
          <div className="space-y-2">
            <label className="section-label">Active Days</label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(DAY_NAMES).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => toggleDay(value)}
                  className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
                    selectedDays.includes(value)
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {label.slice(0, 3)}
                </button>
              ))}
            </div>
          </div>
          <button
            type="submit"
            disabled={loading || selectedDays.length === 0}
            className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create Routine"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
