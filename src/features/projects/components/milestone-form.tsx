"use client";

import { useState } from "react";
import { createMilestone } from "@/features/projects/lib/actions";

export function MilestoneForm({ projectId }: { projectId: string }) {
  const [name, setName] = useState("");
  const [weight, setWeight] = useState(10);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    await createMilestone({ projectId, name: name.trim(), weight });
    setName("");
    setWeight(10);
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2">
      <div className="flex-1 space-y-1">
        <label htmlFor="milestone-name" className="section-label">New Milestone</label>
        <input
          id="milestone-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          placeholder="Milestone name"
        />
      </div>
      <div className="w-20 space-y-1">
        <label htmlFor="milestone-weight" className="section-label">Weight %</label>
        <input
          id="milestone-weight"
          type="number"
          value={weight}
          onChange={(e) => setWeight(parseInt(e.target.value) || 0)}
          min={1}
          max={100}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-center"
        />
      </div>
      <button
        type="submit"
        disabled={loading || !name.trim()}
        className="h-10 px-4 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
      >
        {loading ? "Adding..." : "Add"}
      </button>
    </form>
  );
}
