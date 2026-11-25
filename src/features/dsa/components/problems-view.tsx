"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, PlusCircle, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CLASSIFICATION_META, DIFFICULTY_BADGE_CLASS } from "../lib/constants";
import {
  filterDsaProblems,
  type ProblemListItem,
  type ProblemRevisionDueFilter,
  type ProblemStatusFilter,
} from "../lib/problems";
import { DSA_CLASSIFICATIONS, DSA_DIFFICULTIES, type DsaDifficultyValue } from "../lib/schemas";
import { AttemptLogSheet, type AttemptSheetTarget } from "./attempt-log-sheet";

interface ProblemsViewProps {
  problems: ProblemListItem[];
  topics: Array<{ id: string; name: string; order: number }>;
  defaultTopicId: string;
  todayStr: string;
}

export function ProblemsView({
  problems,
  topics,
  defaultTopicId,
  todayStr,
}: ProblemsViewProps) {
  const [query, setQuery] = useState("");
  const [topicId, setTopicId] = useState(defaultTopicId);
  const [subtopic, setSubtopic] = useState("all");
  const [difficulty, setDifficulty] = useState<"all" | DsaDifficultyValue>("all");
  const [status, setStatus] = useState<ProblemStatusFilter>("all");
  const [revisionDue, setRevisionDue] = useState<ProblemRevisionDueFilter>("all");
  const [showArchived, setShowArchived] = useState(false);

  const [sheetTarget, setSheetTarget] = useState<AttemptSheetTarget | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const subtopicOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of problems) {
      if (!showArchived && p.archived) continue;
      if (topicId !== "all" && p.topicId !== topicId) continue;
      if (p.subtopic) set.add(p.subtopic);
    }
    return Array.from(set).sort();
  }, [problems, topicId, showArchived]);

  const filtered = useMemo(
    () =>
      filterDsaProblems(problems, {
        query,
        topicId,
        subtopic,
        difficulty,
        status,
        revisionDue,
        showArchived,
        todayStr,
      }),
    [problems, query, topicId, subtopic, difficulty, status, revisionDue, showArchived, todayStr]
  );

  function openAttemptSheet(p: ProblemListItem) {
    setSheetTarget({
      problemId: p.id,
      problemTitle: p.title,
      isRevision: p.attemptCount > 0,
    });
    setSheetOpen(true);
  }

  return (
    <div className="space-y-4">
      {/* Search + Filter Controls */}
      <div className="rounded-xl border border-border bg-card p-3 sm:p-4 space-y-3">
        <div className="relative">
          <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search problem title, subtopic, or tag..."
            className="w-full min-h-[44px] rounded-lg border border-input bg-background pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
          <select
            aria-label="Filter by topic"
            value={topicId}
            onChange={(e) => {
              setTopicId(e.target.value);
              setSubtopic("all");
            }}
            className="min-h-[44px] rounded-lg border border-input bg-background px-2.5 text-xs"
          >
            <option value="all">All topics</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                #{t.order} {t.name}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by subtopic"
            value={subtopic}
            onChange={(e) => setSubtopic(e.target.value)}
            className="min-h-[44px] rounded-lg border border-input bg-background px-2.5 text-xs"
          >
            <option value="all">All subtopics</option>
            {subtopicOptions.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by difficulty"
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as "all" | DsaDifficultyValue)}
            className="min-h-[44px] rounded-lg border border-input bg-background px-2.5 text-xs"
          >
            <option value="all">All difficulties</option>
            {DSA_DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {d.charAt(0).toUpperCase() + d.slice(1)}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by status"
            value={status}
            onChange={(e) => setStatus(e.target.value as ProblemStatusFilter)}
            className="min-h-[44px] rounded-lg border border-input bg-background px-2.5 text-xs"
          >
            <option value="all">All statuses</option>
            <option value="not_attempted">Not attempted</option>
            {DSA_CLASSIFICATIONS.map((c) => (
              <option key={c} value={c}>
                {CLASSIFICATION_META[c].shortLabel}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by revision due"
            value={revisionDue}
            onChange={(e) => setRevisionDue(e.target.value as ProblemRevisionDueFilter)}
            className="min-h-[44px] rounded-lg border border-input bg-background px-2.5 text-xs"
          >
            <option value="all">Revision: Any</option>
            <option value="overdue">Overdue</option>
            <option value="today">Due today</option>
            <option value="next_7_days">Next 7 days</option>
            <option value="none">No revision scheduled</option>
          </select>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Showing <strong>{filtered.length}</strong> problem{filtered.length === 1 ? "" : "s"}
          </span>
          <label className="inline-flex items-center gap-2 min-h-[44px] cursor-pointer">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            Show archived
          </label>
        </div>
      </div>

      {/* Problem List */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          No problems match the current filters.
        </div>
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border bg-card">
          {filtered.map((p) => {
            const isOverdue = Boolean(p.effectiveRevisionDate && p.effectiveRevisionDate < todayStr);
            return (
              <div
                key={p.id}
                className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
              >
                <div className="min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      href={`/dsa/problems/${p.id}`}
                      className="text-sm font-semibold hover:underline truncate max-w-full"
                    >
                      {p.title}
                    </Link>
                    {p.difficulty && (
                      <span
                        className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium capitalize ${DIFFICULTY_BADGE_CLASS[p.difficulty]}`}
                      >
                        {p.difficulty}
                      </span>
                    )}
                    {p.lastClassification ? (
                      <span
                        className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${CLASSIFICATION_META[p.lastClassification].badgeClass}`}
                      >
                        {CLASSIFICATION_META[p.lastClassification].shortLabel}
                      </span>
                    ) : (
                      <span className="rounded-md border border-dashed border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                        Not attempted
                      </span>
                    )}
                    {p.archived && (
                      <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                        Archived
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      {p.topicName}
                      {p.subtopic ? ` · ${p.subtopic}` : ""}
                    </span>
                    {p.effectiveRevisionDate && (
                      <span className={isOverdue ? "text-destructive font-medium" : undefined}>
                        Rev: {p.effectiveRevisionDate}
                        {p.manualNextRevisionDate ? " (manual)" : ""}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {p.sourceUrl && (
                    <a
                      href={p.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open ${p.title}`}
                      className="inline-flex items-center justify-center rounded-lg border border-border px-3 min-h-[44px] min-w-[44px] text-xs font-medium hover:bg-muted"
                    >
                      <ExternalLink className="h-4 w-4 sm:mr-1" />
                      <span className="hidden sm:inline">Open</span>
                    </a>
                  )}
                  <Button
                    type="button"
                    onClick={() => openAttemptSheet(p)}
                    className="min-h-[44px] text-xs flex-1 sm:flex-initial"
                  >
                    <PlusCircle className="h-4 w-4 mr-1.5" />
                    Log attempt
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AttemptLogSheet
        target={sheetTarget}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </div>
  );
}
