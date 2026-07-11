"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { updateRoutine } from "@/features/routines/lib/actions";
import { Link2 } from "lucide-react";

type Routine = {
  id: string;
  name: string;
  timeOfDay: string;
};

export function LinkRoutineDialog({
  identityId,
  routines,
}: {
  identityId: string;
  routines: Routine[];
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleLink(routineId: string) {
    setLoading(true);
    await updateRoutine(routineId, { identityId });
    setLoading(false);
    setOpen(false);
  }

  if (routines.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent transition-colors" />
        }
      >
        <Link2 className="h-4 w-4" />
        Link Routine
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">Link Routine</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground mt-2">
          Choose a routine that reinforces this identity.
        </p>
        <div className="space-y-2 mt-4">
          {routines.map((routine) => (
            <button
              key={routine.id}
              onClick={() => handleLink(routine.id)}
              disabled={loading}
              className="w-full flex items-center justify-between rounded-md border border-border px-3 py-2.5 text-sm hover:bg-accent transition-colors disabled:opacity-50"
            >
              <span>{routine.name}</span>
              <span className="text-xs text-muted-foreground capitalize">
                {routine.timeOfDay}
              </span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
