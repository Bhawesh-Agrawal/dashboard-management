"use client";

import { useState } from "react";
import { format } from "date-fns";
import Markdown from "react-markdown";
import { ReviewTypeBadge } from "./review-type-badge";
import { ReviewMetricsDisplay } from "./review-metrics";
import { ReviewActionsList } from "./review-actions-list";
import { ReviewExport } from "./review-export";
import { generateReviewAction } from "../lib/actions";
import type { ReviewType } from "@prisma/client";
import type { ReviewSection, ActionItem, ReviewMetrics } from "../lib/types";
import { ChevronDown, RefreshCw, BarChart3, ListChecks } from "lucide-react";

function hasAnyMetrics(metrics: ReviewMetrics): boolean {
  return !!(
    metrics.tasksTotal > 0 ||
    metrics.routineAdherence > 0 ||
    metrics.moodAverage != null ||
    metrics.sleepAverage != null ||
    metrics.totalSpent != null ||
    metrics.attendanceRate != null ||
    metrics.deepWorkHours != null ||
    metrics.notesCreated != null ||
    (metrics.projectsProgress && metrics.projectsProgress.length > 0) ||
    (metrics.identityStrength && metrics.identityStrength.length > 0) ||
    (metrics.weeklyTrends && metrics.weeklyTrends.length > 0)
  );
}

export function ReviewDetail({
  id,
  type,
  periodStart,
  periodEnd,
  createdAt,
  summary,
  sections,
  actions,
  metrics,
}: {
  id: string;
  type: ReviewType;
  periodStart: Date;
  periodEnd: Date;
  createdAt: Date;
  summary: string;
  sections: ReviewSection[];
  actions: ActionItem[];
  metrics: ReviewMetrics;
}) {
  const [regenerating, setRegenerating] = useState(false);
  const dateRange = `${format(new Date(periodStart), "MMM d, yyyy")} – ${format(new Date(periodEnd), "MMM d, yyyy")}`;

  async function handleRegenerate() {
    setRegenerating(true);
    await generateReviewAction(type);
    setRegenerating(false);
    window.location.reload();
  }

  const showMetrics = hasAnyMetrics(metrics);

  return (
    <article className="max-w-3xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <ReviewTypeBadge type={type} />
          <span className="text-sm text-muted-foreground">{dateRange}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Generated {format(new Date(createdAt), "MMM d, yyyy 'at' h:mm a")}
        </p>
      </div>

      {/* Executive Summary — editorial pull-quote style */}
      <div className="mb-10 pl-4 border-l-2 border-primary/30">
        <p className="font-serif text-xl leading-relaxed text-foreground/90">
          {summary}
        </p>
      </div>

      {/* Sections — collapsible cards with markdown */}
      <div className="space-y-4 mb-10">
        {sections
          .sort((a, b) => a.order - b.order)
          .map((section, i) => (
            <SectionCard key={i} title={section.title} defaultOpen={i < 3}>
              <div className="review-markdown">
                <Markdown>{section.content}</Markdown>
              </div>
            </SectionCard>
          ))}
      </div>

      {/* Action Items */}
      {actions.length > 0 && (
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <ListChecks className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              Action Items
            </h3>
          </div>
          <ReviewActionsList reviewId={id} actions={actions} />
        </div>
      )}

      {/* Metrics — only show if there's meaningful data */}
      {showMetrics && (
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              Metrics
            </h3>
          </div>
          <div className="p-4 rounded-lg border border-border bg-card">
            <ReviewMetricsDisplay metrics={metrics} />
          </div>
        </div>
      )}

      {/* Actions bar */}
      <div className="flex items-center gap-3 pt-6 border-t border-border">
        <ReviewExport reviewId={id} />
        <button
          onClick={handleRegenerate}
          disabled={regenerating}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground border border-border rounded-md transition-colors disabled:opacity-50"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${regenerating ? "animate-spin" : ""}`}
          />
          {regenerating ? "Regenerating..." : "Regenerate"}
        </button>
      </div>
    </article>
  );
}

function SectionCard({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/30 transition-colors"
      >
        <h3 className="text-sm font-medium">{title}</h3>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-border/50">
          <div className="pt-4">{children}</div>
        </div>
      )}
    </div>
  );
}
