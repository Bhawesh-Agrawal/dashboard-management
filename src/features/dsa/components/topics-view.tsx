"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Pin, ArrowRight, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  CLASSIFICATION_META,
  TOPIC_STATUS_LABELS,
} from "../lib/constants";
import { DSA_TOPIC_STATUSES, type DsaTopicStatusValue } from "../lib/schemas";
import { setDsaCurrentTopic, updateDsaTopicStatus } from "../lib/topic-actions";
import type { TopicOverviewItem, TopicsSummaryCounts } from "../lib/topics";

interface TopicsViewProps {
  initialTopics: TopicOverviewItem[];
  initialSummary: TopicsSummaryCounts;
}

function recomputeSummary(topics: TopicOverviewItem[]): TopicsSummaryCounts {
  let covered = 0;
  let inProgress = 0;
  let remaining = 0;
  for (const t of topics) {
    if (t.status === "practised" || t.status === "needs_revision" || t.status === "comfortable") {
      covered++;
    } else if (t.status === "in_progress") {
      inProgress++;
    } else {
      remaining++;
    }
  }
  return { total: topics.length, covered, inProgress, remaining };
}

export function TopicsView({ initialTopics, initialSummary }: TopicsViewProps) {
  const [topics, setTopics] = useState(initialTopics);
  const [summary, setSummary] = useState(initialSummary);
  const [isPending, startTransition] = useTransition();

  function handleStatusChange(topicId: string, nextStatus: DsaTopicStatusValue) {
    const prevTopics = topics;
    const updated = topics.map((t) =>
      t.id === topicId ? { ...t, status: nextStatus } : t
    );
    setTopics(updated);
    setSummary(recomputeSummary(updated));

    startTransition(async () => {
      try {
        await updateDsaTopicStatus({ topicId, status: nextStatus });
        toast.success(`Status updated to ${TOPIC_STATUS_LABELS[nextStatus]}`);
      } catch (err) {
        setTopics(prevTopics);
        setSummary(recomputeSummary(prevTopics));
        toast.error(err instanceof Error ? err.message : "Failed to update status");
      }
    });
  }

  function handleSetCurrent(topicId: string) {
    const prevTopics = topics;
    const updated = topics.map((t) => ({ ...t, isCurrent: t.id === topicId }));
    setTopics(updated);

    startTransition(async () => {
      try {
        await setDsaCurrentTopic({ topicId });
        const name = updated.find((t) => t.id === topicId)?.name ?? "topic";
        toast.success(`Current topic set to ${name}`);
      } catch (err) {
        setTopics(prevTopics);
        toast.error(err instanceof Error ? err.message : "Failed to set current topic");
      }
    });
  }

  if (topics.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center space-y-3">
        <p className="text-sm font-medium">No topics imported yet.</p>
        <p className="text-xs text-muted-foreground">
          Import a CSV, JSON, or pasted question bank in Settings to create topics.
        </p>
        <Link
          href="/dsa/settings"
          className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground px-4 py-2 text-xs font-medium min-h-[44px]"
        >
          Go to DSA Settings
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="section-label">Total</div>
          <div className="text-xl font-semibold mt-1">{summary.total}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="section-label">Covered</div>
          <div className="text-xl font-semibold mt-1 text-emerald-600 dark:text-emerald-400">
            {summary.covered}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="section-label">In Progress</div>
          <div className="text-xl font-semibold mt-1 text-amber-600 dark:text-amber-400">
            {summary.inProgress}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="section-label">Remaining</div>
          <div className="text-xl font-semibold mt-1 text-muted-foreground">
            {summary.remaining}
          </div>
        </div>
      </div>

      {/* Topic Cards */}
      <div className="space-y-3">
        {topics.map((topic) => {
          const pct =
            topic.totalProblems > 0
              ? Math.round((topic.attemptedProblems / topic.totalProblems) * 100)
              : 0;
          return (
            <div
              key={topic.id}
              className={`rounded-xl border bg-card p-4 space-y-3 ${
                topic.isCurrent ? "border-primary ring-1 ring-primary/20" : "border-border"
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono text-muted-foreground">
                      #{topic.order}
                    </span>
                    <h2 className="text-base font-semibold truncate">{topic.name}</h2>
                    {topic.isCurrent && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[11px] font-medium">
                        <Pin className="h-3 w-3" /> Current
                      </span>
                    )}
                    {topic.overdueCount > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 text-destructive px-2 py-0.5 text-[11px] font-medium">
                        <AlertCircle className="h-3 w-3" /> {topic.overdueCount} overdue
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {topic.attemptedProblems} / {topic.totalProblems} attempted ({pct}%)
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label={`Status for ${topic.name}`}
                    value={topic.status}
                    disabled={isPending}
                    onChange={(e) =>
                      handleStatusChange(topic.id, e.target.value as DsaTopicStatusValue)
                    }
                    className="min-h-[44px] rounded-lg border border-input bg-background px-3 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {DSA_TOPIC_STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {TOPIC_STATUS_LABELS[st]}
                      </option>
                    ))}
                  </select>

                  {!topic.isCurrent && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleSetCurrent(topic.id)}
                      disabled={isPending}
                      className="min-h-[44px] text-xs"
                    >
                      <Pin className="h-3.5 w-3.5 mr-1" />
                      Set current
                    </Button>
                  )}

                  <Link
                    href={`/dsa/problems?topicId=${topic.id}`}
                    className="inline-flex items-center justify-center rounded-lg border border-border px-3 text-xs font-medium hover:bg-muted min-h-[44px]"
                  >
                    Problems
                    <ArrowRight className="h-3.5 w-3.5 ml-1" />
                  </Link>
                </div>
              </div>

              {/* Simple progress bar */}
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>

              {/* Latest-attempt classification counts */}
              <div className="flex flex-wrap gap-1.5">
                {(
                  Object.keys(topic.classificationCounts) as Array<
                    keyof typeof topic.classificationCounts
                  >
                ).map((cls) => (
                  <span
                    key={cls}
                    className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ${CLASSIFICATION_META[cls].badgeClass}`}
                  >
                    {CLASSIFICATION_META[cls].shortLabel}: {topic.classificationCounts[cls]}
                  </span>
                ))}
              </div>

              {/* Read-only Readiness Evidence block */}
              <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                <span className="section-label">Readiness evidence</span>
                <span>
                  Independent (latest):{" "}
                  <strong>{topic.readinessEvidence.independentPercent}%</strong>
                </span>
                <span>
                  Failures (14d):{" "}
                  <strong>{topic.readinessEvidence.failuresLast14Days}</strong>
                </span>
                <span>
                  Overdue:{" "}
                  <strong>{topic.readinessEvidence.overdueCount}</strong>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
