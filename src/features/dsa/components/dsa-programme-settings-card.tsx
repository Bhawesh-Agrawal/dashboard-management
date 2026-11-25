"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { saveDsaSettings } from "../lib/settings-actions";
import type { DsaPhase } from "../lib/schemas";

interface ProgrammeSettingsCardProps {
  initialStartDate: string;
  initialLengthDays: number;
  initialPhases: DsaPhase[];
  currentTopicId: string | null;
}

export function DsaProgrammeSettingsCard({
  initialStartDate,
  initialLengthDays,
  initialPhases,
  currentTopicId,
}: ProgrammeSettingsCardProps) {
  const router = useRouter();
  const [startDate, setStartDate] = useState(initialStartDate);
  const [lengthDays, setLengthDays] = useState(initialLengthDays);
  const [phases, setPhases] = useState<DsaPhase[]>(initialPhases);
  const [newPhaseName, setNewPhaseName] = useState("");
  const [newPhaseDay, setNewPhaseDay] = useState("1");
  const [isPending, startTransition] = useTransition();

  function addPhase() {
    const name = newPhaseName.trim();
    const startDay = Number(newPhaseDay);
    if (!name || !Number.isInteger(startDay) || startDay < 1) {
      toast.error("Enter a valid phase name and start day (>= 1).");
      return;
    }
    setPhases((prev) => [...prev, { name, startDay }].sort((a, b) => a.startDay - b.startDay));
    setNewPhaseName("");
    setNewPhaseDay("");
  }

  function removePhase(idx: number) {
    setPhases((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        await saveDsaSettings({
          programmeStartDate: startDate,
          programmeLengthDays: lengthDays,
          phases,
          currentTopicId,
        });
        toast.success("Programme settings saved");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to save settings");
      }
    });
  }

  return (
    <form
      onSubmit={handleSave}
      className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-4"
    >
      <div>
        <h3 className="text-base font-semibold">Programme Setup</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Set your start date, length (default 90 days), and optional user-defined phases.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="section-label block mb-1">Start Date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
            className="w-full min-h-[44px] rounded-lg border border-input bg-background px-3 text-xs font-mono"
          />
        </div>
        <div>
          <label className="section-label block mb-1">Programme Length (days)</label>
          <input
            type="number"
            min={1}
            max={3650}
            value={lengthDays}
            onChange={(e) => setLengthDays(Number(e.target.value) || 90)}
            required
            className="w-full min-h-[44px] rounded-lg border border-input bg-background px-3 text-xs font-mono"
          />
        </div>
      </div>

      <div className="space-y-2 border-t border-border pt-3">
        <div className="section-label">Phases (optional)</div>
        {phases.length > 0 && (
          <div className="space-y-1.5">
            {phases.map((p, idx) => (
              <div
                key={`${p.name}-${p.startDay}-${idx}`}
                className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-1.5 text-xs"
              >
                <span>
                  Day {p.startDay}+ — <strong>{p.name}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => removePhase(idx)}
                  aria-label={`Remove phase ${p.name}`}
                  className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            placeholder="Phase name (e.g. Foundations)"
            value={newPhaseName}
            onChange={(e) => setNewPhaseName(e.target.value)}
            className="flex-1 min-h-[44px] rounded-lg border border-input bg-background px-3 text-xs"
          />
          <input
            type="number"
            min={1}
            placeholder="Start day"
            value={newPhaseDay}
            onChange={(e) => setNewPhaseDay(e.target.value)}
            className="w-full sm:w-28 min-h-[44px] rounded-lg border border-input bg-background px-3 text-xs font-mono"
          />
          <Button
            type="button"
            variant="outline"
            onClick={addPhase}
            className="min-h-[44px] text-xs"
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add Phase
          </Button>
        </div>
      </div>

      <Button type="submit" disabled={isPending} className="min-h-[44px]">
        {isPending ? "Saving..." : "Save Programme Settings"}
      </Button>
    </form>
  );
}
