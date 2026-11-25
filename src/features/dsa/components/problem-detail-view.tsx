"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Calendar, PlusCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CLASSIFICATION_META, DIFFICULTY_BADGE_CLASS, HELP_TYPE_LABELS } from "../lib/constants";
import { setManualRevisionDate } from "../lib/problem-actions";
import type { AttemptDetailItem } from "../lib/problems";
import type { DsaClassificationValue, DsaDifficultyValue } from "../lib/schemas";
import { AttemptLogSheet } from "./attempt-log-sheet";

interface ProblemDetailProps {
  problem: {
    id: string;
    topicId: string;
    topicName: string;
    subtopic: string;
    title: string;
    difficulty: DsaDifficultyValue | null;
    sourceUrl: string;
    platform: string;
    platformId: string | null;
    orderInTopic: number;
    tags: string[];
    archived: boolean;
    lastClassification: DsaClassificationValue | null;
    lastAttemptAt: string | null;
    intervalDays: number | null;
    consecutiveIndependent: number;
    nextRevisionDate: string | null;
    manualNextRevisionDate: string | null;
    effectiveRevisionDate: string | null;
    failureCount: number;
    attempts: AttemptDetailItem[];
  };
}

export function ProblemDetailView({ problem }: ProblemDetailProps) {
  const router = useRouter();
  const [manualDate, setManualDate] = useState(problem.manualNextRevisionDate ?? "");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSaveManualDate(nextVal: string | null) {
    startTransition(async () => {
      try {
        await setManualRevisionDate({
          problemId: problem.id,
          manualNextRevisionDate: nextVal,
        });
        setManualDate(nextVal ?? "");
        toast.success(nextVal ? `Revision date set to ${nextVal}` : "Manual override cleared");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to update revision date");
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Header / Meta */}
      <div className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {problem.topicName}
            {problem.subtopic ? ` · ${problem.subtopic}` : ""}
          </span>
          {problem.difficulty && (
            <span
              className={`rounded-md px-2 py-0.5 text-xs font-medium capitalize ${DIFFICULTY_BADGE_CLASS[problem.difficulty]}`}
            >
              {problem.difficulty}
            </span>
          )}
          {problem.platform && (
            <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {problem.platform}
              {problem.platformId ? ` #${problem.platformId}` : ""}
            </span>
          )}
        </div>

        {problem.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {problem.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-md border border-border px-2 py-0.5 text-[11px] text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="min-h-[44px]"
          >
            <PlusCircle className="h-4 w-4 mr-1.5" />
            Log attempt
          </Button>
          {problem.sourceUrl && (
            <a
              href={problem.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-lg border border-border px-3 min-h-[44px] text-xs font-medium hover:bg-muted"
            >
              <ExternalLink className="h-4 w-4 mr-1.5" />
              Open Problem
            </a>
          )}
        </div>
      </div>

      {/* Current State */}
      <div className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-4">
        <h2 className="text-sm font-semibold">Current State</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <div className="section-label">Latest</div>
            <div className="mt-1 font-medium">
              {problem.lastClassification
                ? CLASSIFICATION_META[problem.lastClassification].shortLabel
                : "Not attempted"}
            </div>
          </div>
          <div>
            <div className="section-label">Interval / Streak</div>
            <div className="mt-1 font-medium">
              {problem.intervalDays != null ? `${problem.intervalDays}d` : "—"} (
              {problem.consecutiveIndependent} indep.)
            </div>
          </div>
          <div>
            <div className="section-label">Effective Revision</div>
            <div className="mt-1 font-medium">
              {problem.effectiveRevisionDate ?? "None"}
              {problem.manualNextRevisionDate ? " (manual)" : ""}
            </div>
          </div>
          <div>
            <div className="section-label">Failure Count</div>
            <div className="mt-1 font-medium">{problem.failureCount}</div>
          </div>
        </div>

        {/* Manual Revision Date Adjustment */}
        <div className="border-t border-border pt-4 space-y-2">
          <label htmlFor="manual-rev-date" className="text-xs font-medium flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            Manual Revision Date Override
          </label>
          <p className="text-[11px] text-muted-foreground">
            Overrides the scheduled revision date until a newer attempt is logged.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id="manual-rev-date"
              type="date"
              value={manualDate}
              onChange={(e) => setManualDate(e.target.value)}
              className="min-h-[44px] rounded-lg border border-input bg-background px-3 text-xs"
            />
            <Button
              type="button"
              disabled={isPending || !manualDate}
              onClick={() => handleSaveManualDate(manualDate)}
              className="min-h-[44px] text-xs"
            >
              Save date
            </Button>
            {problem.manualNextRevisionDate && (
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={() => handleSaveManualDate(null)}
                className="min-h-[44px] text-xs"
              >
                Clear override
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Attempt History (newest first) */}
      <div className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-3">
        <h2 className="text-sm font-semibold">
          Attempt History ({problem.attempts.length})
        </h2>
        {problem.attempts.length === 0 ? (
          <p className="text-xs text-muted-foreground">No attempts logged yet.</p>
        ) : (
          <div className="divide-y divide-border">
            {problem.attempts.map((a) => (
              <div key={a.id} className="py-3 first:pt-0 last:pb-0 space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${CLASSIFICATION_META[a.classification].badgeClass}`}
                    >
                      {CLASSIFICATION_META[a.classification].shortLabel}
                    </span>
                    <span className="text-xs font-mono text-muted-foreground">
                      {a.attemptDate}
                    </span>
                    {a.isRevision && (
                      <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px]">
                        Revision
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {a.timeSpentMin}m · Conf {a.confidence}/5 · Help: {HELP_TYPE_LABELS[a.helpType]}
                  </span>
                </div>

                {a.mistakeTags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {a.mistakeTags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded bg-destructive/10 text-destructive px-1.5 py-0.5 text-[11px]"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {a.mistakes && (
                  <p className="text-xs text-foreground">
                    <span className="font-medium">Mistakes:</span> {a.mistakes}
                  </p>
                )}
                {a.observation && (
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Notes:</span> {a.observation}
                  </p>
                )}
                {(a.initialApproach || a.finalApproach) && (
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    {a.initialApproach && <p>Initial: {a.initialApproach}</p>}
                    {a.finalApproach && <p>Final: {a.finalApproach}</p>}
                  </div>
                )}
                {(a.timeComplexity || a.spaceComplexity) && (
                  <p className="text-[11px] font-mono text-muted-foreground">
                    Time: {a.timeComplexity || "—"} | Space: {a.spaceComplexity || "—"}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <AttemptLogSheet
        target={{
          problemId: problem.id,
          problemTitle: problem.title,
          isRevision: problem.attempts.length > 0,
        }}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </div>
  );
}
