"use client";

import { useState } from "react";
import { updateRoutine, deleteRoutine } from "@/features/routines/lib/actions";
import { DAY_NAMES } from "@/lib/constants";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Pencil, Trash2 } from "lucide-react";
import type { Identity } from "@prisma/client";

type RoutineData = {
  id: string;
  name: string;
  timeOfDay: string;
  specificTime: string | null;
  streakGoal: number | null;
  activeDays: ("MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN")[];
  identityId: string | null;
};

export function EditRoutineDialog({
  routine,
  identities,
}: {
  routine: RoutineData;
  identities?: Identity[];
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeDays, setActiveDays] = useState<("MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN")[]>(routine.activeDays);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);

    await updateRoutine(routine.id, {
      name: formData.get("name") as string,
      timeOfDay: formData.get("timeOfDay") as "morning" | "afternoon" | "evening" | "anytime",
      specificTime: (formData.get("specificTime") as string) || null,
      streakGoal: formData.get("streakGoal")
        ? parseInt(formData.get("streakGoal") as string)
        : null,
      activeDays,
      identityId: (formData.get("identityId") as string) || null,
    });

    setLoading(false);
    setOpen(false);
  }

  async function handleDelete() {
    if (!confirm("Delete this routine?")) return;
    setLoading(true);
    await deleteRoutine(routine.id);
    setLoading(false);
    setOpen(false);
  }

  function toggleDay(day: "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN") {
    setActiveDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<button className="p-1 text-muted-foreground hover:text-foreground transition-colors" />}
      >
        <Pencil className="h-3.5 w-3.5" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">Edit Routine</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <label htmlFor="edit-name" className="section-label">
              Name
            </label>
            <input
              id="edit-name"
              name="name"
              required
              defaultValue={routine.name}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label htmlFor="edit-timeOfDay" className="section-label">
                Time of Day
              </label>
              <select
                id="edit-timeOfDay"
                name="timeOfDay"
                defaultValue={routine.timeOfDay}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="morning">Morning</option>
                <option value="afternoon">Afternoon</option>
                <option value="evening">Evening</option>
                <option value="anytime">Anytime</option>
              </select>
            </div>
            <div className="space-y-2">
              <label htmlFor="edit-specificTime" className="section-label">
                Specific Time
              </label>
              <input
                id="edit-specificTime"
                name="specificTime"
                type="time"
                defaultValue={routine.specificTime || ""}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>
          {identities && identities.length > 0 && (
            <div className="space-y-2">
              <label htmlFor="edit-identityId" className="section-label">
                Reinforces Identity
              </label>
              <select
                id="edit-identityId"
                name="identityId"
                defaultValue={routine.identityId || ""}
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
                Who does this make you become?
              </p>
            </div>
          )}
          <div className="space-y-2">
            <label className="section-label">Active Days</label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(DAY_NAMES) as ("MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN")[]).map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                    activeDays.includes(day)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {DAY_NAMES[day]}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <label htmlFor="edit-streakGoal" className="section-label">
              Streak Goal (days, blank = ongoing)
            </label>
            <input
              id="edit-streakGoal"
              name="streakGoal"
              type="number"
              min="1"
              defaultValue={routine.streakGoal || ""}
              placeholder="Ongoing"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={handleDelete}
              disabled={loading}
              className="inline-flex items-center gap-1 text-sm text-destructive hover:text-destructive/80 transition-colors disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {loading ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
