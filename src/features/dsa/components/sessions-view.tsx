"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Calendar, Clock, Pencil, PlusCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CLASSIFICATION_META } from "../lib/constants";
import { upsertDsaSession } from "../lib/session-actions";
import type { DsaSessionViewItem, SessionAttemptItem } from "../lib/sessions";
import { AttemptLogSheet, type AttemptSheetTarget } from "./attempt-log-sheet";

interface SessionsViewProps {
  todayStr: string;
  sessions: DsaSessionViewItem[];
  problemOptions: Array<{
    id: string;
    title: string;
    topicName: string;
    hasAttempts: boolean;
  }>;
}

const DURATION_CHIPS = [30, 45, 60, 90, 120] as const;

export function SessionsView({
  todayStr,
  sessions,
  problemOptions,
}: SessionsViewProps) {
  const router = useRouter();
  const initialToday = sessions.find((s) => s.date === todayStr);

  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [durationMin, setDurationMin] = useState<string>(
    initialToday?.durationMin != null ? String(initialToday.durationMin) : ""
  );
  const [observations, setObservations] = useState(initialToday?.observations ?? "");
  const [nextAvailabilityMin, setNextAvailabilityMin] = useState<string>(
    initialToday?.nextSessionAvailabilityMin != null
      ? String(initialToday.nextSessionAvailabilityMin)
      : ""
  );
  const [nextSessionNote, setNextSessionNote] = useState(
    initialToday?.nextSessionNote ?? ""
  );
  const [selectedProblemId, setSelectedProblemId] = useState(
    problemOptions[0]?.id ?? ""
  );

  const [sheetTarget, setSheetTarget] = useState<AttemptSheetTarget | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function loadDateIntoForm(dateStr: string) {
    setSelectedDate(dateStr);
    const existing = sessions.find((s) => s.date === dateStr);
    setDurationMin(existing?.durationMin != null ? String(existing.durationMin) : "");
    setObservations(existing?.observations ?? "");
    setNextAvailabilityMin(
      existing?.nextSessionAvailabilityMin != null
        ? String(existing.nextSessionAvailabilityMin)
        : ""
    );
    setNextSessionNote(existing?.nextSessionNote ?? "");
  }

  function handleSaveSession(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        await upsertDsaSession({
          date: selectedDate,
          durationMin: durationMin.trim() === "" ? null : Number(durationMin),
          observations,
          nextSessionAvailabilityMin:
            nextAvailabilityMin.trim() === "" ? null : Number(nextAvailabilityMin),
          nextSessionNote,
        });
        toast.success(`Session saved for ${selectedDate}`);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to save session");
      }
    });
  }

  function handleAddAttemptForDate(dateStr: string) {
    const prob = problemOptions.find((p) => p.id === selectedProblemId);
    if (!prob) {
      toast.error("Select a problem first.");
      return;
    }
    setSheetTarget({
      problemId: prob.id,
      problemTitle: prob.title,
      isRevision: prob.hasAttempts,
    });
    setSelectedDate(dateStr);
    setSheetOpen(true);
  }

  function handleEditAttempt(a: SessionAttemptItem) {
    setSheetTarget({
      problemId: a.problemId,
      problemTitle: a.problemTitle,
      isRevision: a.isRevision,
      editAttempt: a,
    });
    setSheetOpen(true);
  }

  return (
    <div className="space-y-6">
      {/* 30-second Close Session / Log Session Form */}
      <form
        onSubmit={handleSaveSession}
        className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">Close / Log Session</h2>
            <p className="text-xs text-muted-foreground">
              Record duration, notes, and next-session availability (even for lecture-only days).
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <input
              type="date"
              aria-label="Session date"
              value={selectedDate}
              onChange={(e) => loadDateIntoForm(e.target.value)}
              className="min-h-[44px] rounded-lg border border-input bg-background px-3 text-xs font-mono"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="section-label block">Duration (minutes)</label>
          <div className="flex flex-wrap items-center gap-1.5">
            {DURATION_CHIPS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setDurationMin(String(m))}
                className={`min-h-[44px] min-w-[48px] rounded-lg border px-3 text-xs font-medium transition-colors ${
                  durationMin === String(m)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border hover:bg-muted"
                }`}
              >
                {m}m
              </button>
            ))}
            <input
              type="number"
              min={0}
              max={1440}
              placeholder="min"
              value={durationMin}
              onChange={(e) => setDurationMin(e.target.value)}
              className="min-h-[44px] w-24 rounded-lg border border-input bg-background px-2.5 text-xs font-mono"
            />
          </div>
        </div>

        <div>
          <label className="section-label block mb-1">General Observations</label>
          <textarea
            rows={2}
            value={observations}
            onChange={(e) => setObservations(e.target.value)}
            placeholder="Concepts covered, focus level, lecture notes..."
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="section-label block mb-1">
              Next Session Availability (min)
            </label>
            <input
              type="number"
              min={0}
              max={1440}
              placeholder="e.g. 60"
              value={nextAvailabilityMin}
              onChange={(e) => setNextAvailabilityMin(e.target.value)}
              className="w-full min-h-[44px] rounded-lg border border-input bg-background px-3 text-xs font-mono"
            />
          </div>
          <div>
            <label className="section-label block mb-1">Next Session Note</label>
            <input
              type="text"
              placeholder="e.g. Morning before lab"
              value={nextSessionNote}
              onChange={(e) => setNextSessionNote(e.target.value)}
              className="w-full min-h-[44px] rounded-lg border border-input bg-background px-3 text-xs"
            />
          </div>
        </div>

        <Button type="submit" disabled={isPending} className="min-h-[44px] w-full sm:w-auto">
          {isPending ? "Saving..." : `Save Session (${selectedDate})`}
        </Button>
      </form>

      {/* Quick Add Attempt for Selected Date */}
      {problemOptions.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-2.5">
          <div className="section-label">Add Attempt to {selectedDate}</div>
          <div className="flex flex-col sm:flex-row gap-2">
            <select
              aria-label="Choose problem for attempt"
              value={selectedProblemId}
              onChange={(e) => setSelectedProblemId(e.target.value)}
              className="flex-1 min-h-[44px] rounded-lg border border-input bg-background px-3 text-xs"
            >
              {problemOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.topicName} — {p.title}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleAddAttemptForDate(selectedDate)}
              className="min-h-[44px] text-xs shrink-0"
            >
              <PlusCircle className="h-4 w-4 mr-1.5" />
              Log attempt for {selectedDate}
            </Button>
          </div>
        </div>
      )}

      {/* Sessions List */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold">Recent Sessions ({sessions.length})</h2>
        {sessions.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-6 text-center text-xs text-muted-foreground">
            No sessions yet. Log an attempt or save a session above.
          </div>
        ) : (
          sessions.map((s) => (
            <div
              key={s.id}
              className="rounded-xl border border-border bg-card p-4 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold font-mono">{s.date}</span>
                  {s.durationMin != null && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs">
                      <Clock className="h-3 w-3" />
                      {s.durationMin}m
                    </span>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => loadDateIntoForm(s.date)}
                  className="min-h-[44px] text-xs"
                >
                  Edit session
                </Button>
              </div>

              {/* Derived counts */}
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-md border border-border px-2 py-0.5">
                  Attempted: <strong>{s.derived.attempted}</strong>
                </span>
                <span className="rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 px-2 py-0.5">
                  Independent: <strong>{s.derived.solvedIndependently}</strong>
                </span>
                <span className="rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-300 px-2 py-0.5">
                  Needing help: <strong>{s.derived.needingHelp}</strong>
                </span>
                <span className="rounded-md bg-rose-500/10 text-rose-700 dark:text-rose-300 px-2 py-0.5">
                  Not understood: <strong>{s.derived.notUnderstood}</strong>
                </span>
              </div>

              {s.derived.topicsPractised.length > 0 && (
                <div className="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                  <span>Topics:</span>
                  {s.derived.topicsPractised.map((topic) => (
                    <span
                      key={topic}
                      className="rounded bg-muted px-1.5 py-0.5 text-foreground"
                    >
                      {topic}
                    </span>
                  ))}
                </div>
              )}

              {s.observations && (
                <p className="text-xs text-foreground">{s.observations}</p>
              )}

              {(s.nextSessionAvailabilityMin != null || s.nextSessionNote) && (
                <p className="text-xs text-muted-foreground">
                  Next session:{" "}
                  {s.nextSessionAvailabilityMin != null
                    ? `${s.nextSessionAvailabilityMin} min`
                    : ""}
                  {s.nextSessionAvailabilityMin != null && s.nextSessionNote ? " — " : ""}
                  {s.nextSessionNote ?? ""}
                </p>
              )}

              {/* Linked attempts */}
              {s.attempts.length > 0 && (
                <div className="border-t border-border pt-2.5 divide-y divide-border/60">
                  {s.attempts.map((a) => (
                    <div
                      key={a.id}
                      className="py-2 first:pt-0 last:pb-0 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link
                            href={`/dsa/problems/${a.problemId}`}
                            className="text-xs font-medium hover:underline truncate"
                          >
                            {a.problemTitle}
                          </Link>
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${CLASSIFICATION_META[a.classification].badgeClass}`}
                          >
                            {CLASSIFICATION_META[a.classification].shortLabel}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          {a.topicName} · {a.timeSpentMin}m · Conf {a.confidence}/5
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleEditAttempt(a)}
                        aria-label={`Edit ${a.problemTitle} attempt`}
                        className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground shrink-0"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <AttemptLogSheet
        target={sheetTarget}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        defaultDate={selectedDate}
      />
    </div>
  );
}
