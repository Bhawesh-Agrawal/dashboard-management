"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Calendar, ExternalLink, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CLASSIFICATION_META, DIFFICULTY_BADGE_CLASS } from "../lib/constants";
import { setManualRevisionDate } from "../lib/problem-actions";
import type { RevisionQueueItem, RevisionQueueSections } from "../lib/revision";
import { AttemptLogSheet, type AttemptSheetTarget } from "./attempt-log-sheet";

interface RevisionQueueViewProps {
  todayStr: string;
  queue: RevisionQueueSections;
}

export function RevisionQueueView({ todayStr, queue }: RevisionQueueViewProps) {
  const router = useRouter();
  const [attemptTarget, setAttemptTarget] = useState<AttemptSheetTarget | null>(null);
  const [attemptOpen, setAttemptOpen] = useState(false);

  const [adjustItem, setAdjustItem] = useState<RevisionQueueItem | null>(null);
  const [adjustDate, setAdjustDate] = useState("");
  const [isPending, startTransition] = useTransition();

  function openLogResult(item: RevisionQueueItem) {
    setAttemptTarget({
      problemId: item.id,
      problemTitle: item.title,
      isRevision: true,
    });
    setAttemptOpen(true);
  }

  function openAdjustDate(item: RevisionQueueItem) {
    setAdjustItem(item);
    setAdjustDate(item.effectiveRevisionDate ?? todayStr);
  }

  function handleSaveDate(nextDate: string | null) {
    if (!adjustItem) return;
    const problemId = adjustItem.id;
    startTransition(async () => {
      try {
        await setManualRevisionDate({
          problemId,
          manualNextRevisionDate: nextDate,
        });
        toast.success(nextDate ? `Revision date updated to ${nextDate}` : "Manual date cleared");
        setAdjustItem(null);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to update date");
      }
    });
  }

  const sections: Array<{
    key: keyof RevisionQueueSections;
    title: string;
    emptyText: string;
    accent?: string;
  }> = [
    {
      key: "overdue",
      title: "Overdue",
      emptyText: "No overdue revisions.",
      accent: "text-destructive",
    },
    {
      key: "dueToday",
      title: "Due Today",
      emptyText: "Nothing else due today.",
    },
    {
      key: "next7Days",
      title: "Next 7 Days",
      emptyText: "No revisions scheduled in the next 7 days.",
    },
    {
      key: "recentlyRevised",
      title: "Recently Revised (Last 7 Days)",
      emptyText: "No problems revised in the last 7 days.",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header Counts Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="section-label">Overdue</div>
          <div className="text-xl font-semibold mt-1 text-destructive">
            {queue.overdue.length}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="section-label">Due Today</div>
          <div className="text-xl font-semibold mt-1 text-amber-600 dark:text-amber-400">
            {queue.dueToday.length}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="section-label">Next 7 Days</div>
          <div className="text-xl font-semibold mt-1">{queue.next7Days.length}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="section-label">Revised (7d)</div>
          <div className="text-xl font-semibold mt-1 text-emerald-600 dark:text-emerald-400">
            {queue.recentlyRevised.length}
          </div>
        </div>
      </div>

      {/* Sections */}
      {sections.map((section) => {
        const items = queue[section.key];
        return (
          <section key={section.key} className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h2 className={`text-sm font-semibold ${section.accent ?? ""}`}>
                {section.title} ({items.length})
              </h2>
            </div>

            {items.length === 0 ? (
              <div className="rounded-xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
                {section.emptyText}
              </div>
            ) : (
              <div className="divide-y divide-border rounded-xl border border-border bg-card">
                {items.map((item) => (
                  <div
                    key={`${section.key}-${item.id}`}
                    className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          href={`/dsa/problems/${item.id}`}
                          className="text-sm font-semibold hover:underline truncate max-w-full"
                        >
                          {item.title}
                        </Link>
                        {item.difficulty && (
                          <span
                            className={`rounded px-1.5 py-0.5 text-[11px] font-medium capitalize ${DIFFICULTY_BADGE_CLASS[item.difficulty]}`}
                          >
                            {item.difficulty}
                          </span>
                        )}
                        {item.lastClassification && (
                          <span
                            className={`rounded px-2 py-0.5 text-[11px] font-medium ${CLASSIFICATION_META[item.lastClassification].badgeClass}`}
                          >
                            {CLASSIFICATION_META[item.lastClassification].shortLabel}
                          </span>
                        )}
                        {item.failureCount > 0 && (
                          <span className="rounded bg-destructive/10 text-destructive px-1.5 py-0.5 text-[11px] font-medium">
                            {item.failureCount} fail{item.failureCount === 1 ? "" : "s"}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        <span>
                          {item.topicName}
                          {item.subtopic ? ` · ${item.subtopic}` : ""}
                        </span>
                        {item.effectiveRevisionDate && (
                          <span className={item.daysOverdue > 0 ? "text-destructive font-medium" : undefined}>
                            {item.daysOverdue > 0
                              ? `${item.daysOverdue}d overdue (${item.effectiveRevisionDate})`
                              : `Scheduled: ${item.effectiveRevisionDate}`}
                            {item.manualNextRevisionDate ? " (manual)" : ""}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {item.sourceUrl && (
                        <a
                          href={item.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Open ${item.title}`}
                          className="inline-flex items-center justify-center rounded-lg border border-border min-h-[44px] min-w-[44px] px-2.5 text-xs hover:bg-muted"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => openAdjustDate(item)}
                        className="min-h-[44px] text-xs"
                      >
                        <Calendar className="h-3.5 w-3.5 mr-1.5" />
                        Adjust date
                      </Button>
                      <Button
                        type="button"
                        onClick={() => openLogResult(item)}
                        className="min-h-[44px] text-xs"
                      >
                        <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                        Log result
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}

      {/* Attempt Sheet with isRevision=true */}
      <AttemptLogSheet
        target={attemptTarget}
        open={attemptOpen}
        onOpenChange={setAttemptOpen}
        defaultDate={todayStr}
      />

      {/* Adjust Date Bottom Sheet */}
      <Sheet
        open={Boolean(adjustItem)}
        onOpenChange={(o) => {
          if (!o) setAdjustItem(null);
        }}
      >
        <SheetContent side="bottom" className="rounded-t-2xl p-4 sm:p-6">
          <div className="max-w-md mx-auto space-y-4">
            <SheetHeader className="p-0">
              <SheetTitle>Adjust Revision Date — {adjustItem?.title}</SheetTitle>
            </SheetHeader>
            <p className="text-xs text-muted-foreground">
              Overrides the automatic schedule until a newer attempt is logged.
            </p>
            <input
              type="date"
              value={adjustDate}
              onChange={(e) => setAdjustDate(e.target.value)}
              className="w-full min-h-[44px] rounded-lg border border-input bg-background px-3 text-sm"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={isPending || !adjustDate}
                onClick={() => handleSaveDate(adjustDate)}
                className="min-h-[44px] flex-1"
              >
                {isPending ? "Saving..." : "Save Date"}
              </Button>
              {adjustItem?.manualNextRevisionDate && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={isPending}
                  onClick={() => handleSaveDate(null)}
                  className="min-h-[44px]"
                >
                  Clear Override
                </Button>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
