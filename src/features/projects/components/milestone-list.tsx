"use client";

import { toggleMilestoneDone, deleteMilestone } from "@/features/projects/lib/actions";
import { Pencil } from "lucide-react";
import { useState } from "react";
import { updateMilestone } from "@/features/projects/lib/actions";

type MilestoneData = {
  id: string;
  name: string;
  weight: number;
  isDone: boolean;
  projectId: string;
};

export function MilestoneList({
  milestones,
  projectId,
}: {
  milestones: MilestoneData[];
  projectId: string;
}) {
  if (milestones.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No milestones yet. Add one to track progress.
      </p>
    );
  }

  return (
    <div className="space-y-0.5">
      {milestones.map((m) => (
        <MilestoneRow key={m.id} milestone={m} projectId={projectId} />
      ))}
    </div>
  );
}

function MilestoneRow({
  milestone,
  projectId,
}: {
  milestone: MilestoneData;
  projectId: string;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(milestone.name);
  const [weight, setWeight] = useState(milestone.weight);

  async function handleSave() {
    await updateMilestone(milestone.id, { name, weight }, projectId);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="list-row items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 h-8 rounded border border-input bg-background px-2 text-sm"
        />
        <input
          type="number"
          value={weight}
          onChange={(e) => setWeight(parseInt(e.target.value) || 0)}
          className="w-16 h-8 rounded border border-input bg-background px-2 text-sm text-center"
          min={1}
          max={100}
        />
        <span className="text-xs text-muted-foreground">%</span>
        <button
          onClick={handleSave}
          className="text-xs text-primary hover:underline"
        >
          Save
        </button>
        <button
          onClick={() => setEditing(false)}
          className="text-xs text-muted-foreground hover:underline"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="list-row items-center group">
      <button
        onClick={() => toggleMilestoneDone(milestone.id, projectId)}
        className={`shrink-0 h-4 w-4 rounded border transition-colors ${
          milestone.isDone
            ? "bg-primary border-primary text-primary-foreground"
            : "border-border"
        }`}
      >
        {milestone.isDone && "✓"}
      </button>

      <span
        className={`flex-1 text-sm ${
          milestone.isDone ? "line-through text-muted-foreground" : ""
        }`}
      >
        {milestone.name}
      </span>

      <span className="text-xs text-muted-foreground">{milestone.weight}%</span>

      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
        <button
          onClick={() => setEditing(true)}
          className="p-1 rounded hover:bg-accent transition-colors"
        >
          <Pencil className="h-3 w-3 text-muted-foreground" />
        </button>
        <button
          onClick={() => deleteMilestone(milestone.id, projectId)}
          className="p-1 rounded hover:bg-accent transition-colors text-destructive"
        >
          ×
        </button>
      </div>
    </div>
  );
}
