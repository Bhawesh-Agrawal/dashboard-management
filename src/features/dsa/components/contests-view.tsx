"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Trophy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DSA_CONTEST_PLATFORMS, type DsaContestPlatformValue } from "../lib/schemas";
import {
  createDsaContest,
  deleteDsaContest,
  updateDsaContest,
} from "../lib/contest-actions";
import type { DsaContestItem } from "../lib/contests";

export function ContestsView({
  todayStr,
  contests,
}: {
  todayStr: string;
  contests: DsaContestItem[];
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [platform, setPlatform] = useState<DsaContestPlatformValue>("leetcode");
  const [name, setName] = useState("");
  const [date, setDate] = useState(todayStr);
  const [problemsAttempted, setProblemsAttempted] = useState("4");
  const [problemsSolved, setProblemsSolved] = useState("2");
  const [rankOrRating, setRankOrRating] = useState("");
  const [upsolveProblems, setUpsolveProblems] = useState("");
  const [conceptsMissed, setConceptsMissed] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function resetForm() {
    setEditingId(null);
    setPlatform("leetcode");
    setName("");
    setDate(todayStr);
    setProblemsAttempted("4");
    setProblemsSolved("2");
    setRankOrRating("");
    setUpsolveProblems("");
    setConceptsMissed("");
  }

  function startEdit(c: DsaContestItem) {
    setEditingId(c.id);
    setPlatform(c.platform);
    setName(c.name);
    setDate(c.date);
    setProblemsAttempted(String(c.problemsAttempted));
    setProblemsSolved(String(c.problemsSolved));
    setRankOrRating(c.rankOrRating ?? "");
    setUpsolveProblems(c.upsolveProblems ?? "");
    setConceptsMissed(c.conceptsMissed ?? "");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        const payload = {
          platform,
          name,
          date,
          problemsAttempted: Number(problemsAttempted),
          problemsSolved: Number(problemsSolved),
          rankOrRating: rankOrRating || null,
          upsolveProblems: upsolveProblems || null,
          conceptsMissed: conceptsMissed || null,
        };
        if (editingId) {
          await updateDsaContest({ ...payload, id: editingId });
          toast.success("Contest updated");
        } else {
          await createDsaContest(payload);
          toast.success("Contest logged");
        }
        resetForm();
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to save contest");
      }
    });
  }

  function handleConfirmDelete() {
    if (!deleteId) return;
    const id = deleteId;
    startTransition(async () => {
      try {
        await deleteDsaContest({ id });
        setDeleteId(null);
        if (editingId === id) resetForm();
        toast.success("Contest deleted");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to delete contest");
      }
    });
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">
            {editingId ? "Edit Contest Entry" : "Log Contest"}
          </h2>
          {editingId && (
            <Button
              type="button"
              variant="ghost"
              onClick={resetForm}
              className="min-h-[44px] text-xs"
            >
              Cancel edit
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="section-label block mb-1">Platform</label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value as DsaContestPlatformValue)}
              className="w-full min-h-[44px] rounded-lg border border-input bg-background px-3 text-xs capitalize"
            >
              {DSA_CONTEST_PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="section-label block mb-1">Contest Name</label>
            <input
              type="text"
              required
              placeholder="e.g. Weekly Contest 425"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full min-h-[44px] rounded-lg border border-input bg-background px-3 text-xs"
            />
          </div>
          <div>
            <label className="section-label block mb-1">Date</label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full min-h-[44px] rounded-lg border border-input bg-background px-3 text-xs font-mono"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <label className="section-label block mb-1">Attempted</label>
            <input
              type="number"
              min={0}
              max={100}
              required
              value={problemsAttempted}
              onChange={(e) => setProblemsAttempted(e.target.value)}
              className="w-full min-h-[44px] rounded-lg border border-input bg-background px-3 text-xs font-mono"
            />
          </div>
          <div>
            <label className="section-label block mb-1">Solved</label>
            <input
              type="number"
              min={0}
              max={100}
              required
              value={problemsSolved}
              onChange={(e) => setProblemsSolved(e.target.value)}
              className="w-full min-h-[44px] rounded-lg border border-input bg-background px-3 text-xs font-mono"
            />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="section-label block mb-1">Rank / Rating (optional)</label>
            <input
              type="text"
              placeholder="e.g. 2400 / 1620"
              value={rankOrRating}
              onChange={(e) => setRankOrRating(e.target.value)}
              className="w-full min-h-[44px] rounded-lg border border-input bg-background px-3 text-xs"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="section-label block mb-1">Problems to Upsolve</label>
            <textarea
              rows={2}
              value={upsolveProblems}
              onChange={(e) => setUpsolveProblems(e.target.value)}
              placeholder="Q3, Q4..."
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs"
            />
          </div>
          <div>
            <label className="section-label block mb-1">Concepts Missed</label>
            <textarea
              rows={2}
              value={conceptsMissed}
              onChange={(e) => setConceptsMissed(e.target.value)}
              placeholder="Bitmask DP, Monotonic stack..."
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs"
            />
          </div>
        </div>

        <Button type="submit" disabled={isPending} className="min-h-[44px]">
          {isPending ? "Saving..." : editingId ? "Update Contest" : "Save Contest"}
        </Button>
      </form>

      {/* Contest List */}
      <div className="space-y-2.5">
        <h2 className="text-sm font-semibold">Logged Contests ({contests.length})</h2>
        {contests.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-6 text-center text-xs text-muted-foreground">
            No contests logged yet.
          </div>
        ) : (
          <div className="divide-y divide-border rounded-xl border border-border bg-card">
            {contests.map((c) => (
              <div key={c.id} className="p-4 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Trophy className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm font-semibold">{c.name}</span>
                      <span className="rounded bg-muted px-2 py-0.5 text-[11px] capitalize">
                        {c.platform}
                      </span>
                      <span className="text-xs font-mono text-muted-foreground">
                        {c.date}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Solved <strong>{c.problemsSolved}</strong> / {c.problemsAttempted}
                      {c.rankOrRating ? ` · Rank/Rating: ${c.rankOrRating}` : ""}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => startEdit(c)}
                      aria-label={`Edit ${c.name}`}
                      className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteId(c.id)}
                      aria-label={`Delete ${c.name}`}
                      className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {c.upsolveProblems && (
                  <p className="text-xs">
                    <span className="font-medium">Upsolve:</span> {c.upsolveProblems}
                  </p>
                )}
                {c.conceptsMissed && (
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Missed:</span>{" "}
                    {c.conceptsMissed}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog
        open={Boolean(deleteId)}
        onOpenChange={(o) => {
          if (!o) setDeleteId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Contest Entry?</DialogTitle>
            <DialogDescription>
              This permanently removes this manual contest record.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteId(null)}
              className="min-h-[44px]"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isPending}
              onClick={handleConfirmDelete}
              className="min-h-[44px]"
            >
              {isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
