"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, ExternalLink, PlusCircle, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CLASSIFICATION_META, DIFFICULTY_BADGE_CLASS } from "../lib/constants";
import type { DsaDashboardData } from "../lib/dashboard";
import type { WeeklyTopicTrendData } from "../lib/analytics";
import { setDsaCurrentTopic } from "../lib/topic-actions";
import { AttemptLogSheet, type AttemptSheetTarget } from "./attempt-log-sheet";
import { DsaProgrammeSettingsCard } from "./dsa-programme-settings-card";
import { DsaImportCard } from "./dsa-import-card";

export function DsaDashboardView({
  data,
  weeklyTrend,
}: {
  data: DsaDashboardData;
  weeklyTrend?: WeeklyTopicTrendData;
}) {
  const router = useRouter();
  const [sheetTarget, setSheetTarget] = useState<AttemptSheetTarget | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [topicPending, startTopicTransition] = useTransition();

  function handleTopicChange(topicId: string) {
    if (!topicId || topicId === data.studyToday.currentTopic?.id) return;
    startTopicTransition(async () => {
      try {
        await setDsaCurrentTopic({ topicId });
        const chosen = data.topicsSummary.perTopic.find((t) => t.id === topicId);
        toast.success(`Today's topic set to ${chosen?.name ?? "selected topic"}`);
        router.refresh();
      } catch {
        toast.error("Failed to update today's topic");
      }
    });
  }

  if (data.isFirstRun) {
    return (
      <div className="space-y-6">
        <div className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-1">
          <h2 className="text-base font-semibold">First-Run Setup</h2>
          <p className="text-xs text-muted-foreground">
            Set your programme start date and import your question bank CSV/JSON to begin tracking.
          </p>
        </div>
        {!data.hasSettings && (
          <DsaProgrammeSettingsCard
            initialStartDate={data.programmeStartDate}
            initialLengthDays={data.programmeLengthDays}
            initialPhases={[]}
            currentTopicId={null}
          />
        )}
        {!data.hasBank && <DsaImportCard />}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Backup Banner (> 7 days) */}
      {data.needsBackupBanner && (
        <div className="rounded-xl border border-border bg-muted/40 p-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2 text-xs text-foreground">
            <ShieldAlert className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span>
              {data.lastBackupAt
                ? `Last backup was over 7 days ago (${data.lastBackupAt.slice(0, 10)}).`
                : "You haven't downloaded a DSA backup yet."}
            </span>
          </div>
          <Link
            href="/dsa/settings#backup"
            className="inline-flex items-center justify-center rounded-lg border border-border px-3 min-h-[44px] text-xs font-medium hover:bg-muted whitespace-nowrap"
          >
            Export Backup
          </Link>
        </div>
      )}

      {/* Programme Snapshot Header Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="section-label">Programme Day</div>
          <div className="text-lg font-semibold mt-1">
            Day {data.programmeDay}{" "}
            <span className="text-xs font-normal text-muted-foreground">
              / {data.programmeLengthDays}
            </span>
          </div>
          {data.currentPhase && (
            <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
              {data.currentPhase}
            </div>
          )}
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="section-label">Attempted</div>
          <div className="text-lg font-semibold mt-1">
            {data.totals.attempted}{" "}
            <span className="text-xs font-normal text-muted-foreground">
              / {data.totals.problems}
            </span>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="section-label">Independent (Latest)</div>
          <div className="text-lg font-semibold mt-1 text-foreground">
            {data.totals.independent}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="section-label">Due Revision</div>
          <div className="text-lg font-semibold mt-1">
            <span className={data.studyToday.overdueCount > 0 ? "text-destructive" : ""}>
              {data.studyToday.overdueCount} ov
            </span>{" "}
            · {data.studyToday.dueTodayCount} today
          </div>
        </div>
      </div>

      {/* Q1 & Q2 Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Q1: What to study today */}
        <div className="lg:col-span-2 rounded-xl border border-border bg-card p-4 space-y-3 overflow-hidden">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold">1. What to study today</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {data.studyToday.dueTodayCount} revision due today
              </p>
            </div>
            <Link
              href="/dsa/problems"
              className="text-xs font-medium text-primary hover:underline min-h-[44px] inline-flex items-center shrink-0 whitespace-nowrap"
            >
              All problems
            </Link>
          </div>

          {data.topicsSummary.perTopic.length > 0 && (
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs text-muted-foreground shrink-0">Topic:</span>
              <select
                aria-label="Select today's topic"
                value={data.studyToday.currentTopic?.id ?? ""}
                disabled={topicPending}
                onChange={(e) => handleTopicChange(e.target.value)}
                className="w-full min-w-0 max-w-full min-h-[44px] rounded-md border border-border bg-background px-2.5 text-xs text-foreground truncate disabled:opacity-50"
              >
                {data.topicsSummary.perTopic.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.attempted}/{t.total})
                  </option>
                ))}
              </select>
            </div>
          )}

          {data.studyToday.nextProblems.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              All problems in this topic have been attempted. Pick a new current topic in{" "}
              <Link href="/dsa/topics" className="underline">
                Topics
              </Link>
              .
            </p>
          ) : (
            <div className="divide-y divide-border">
              {data.studyToday.nextProblems.map((p) => (
                <div
                  key={p.id}
                  className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        href={`/dsa/problems/${p.id}`}
                        className="text-sm font-medium hover:underline truncate"
                      >
                        {p.title}
                      </Link>
                      {p.difficulty && (
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-medium capitalize ${DIFFICULTY_BADGE_CLASS[p.difficulty]}`}
                        >
                          {p.difficulty}
                        </span>
                      )}
                    </div>
                    {p.subtopic && (
                      <p className="text-[11px] text-muted-foreground">{p.subtopic}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {p.sourceUrl && (
                      <a
                        href={p.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Open ${p.title}`}
                        className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg border border-border hover:bg-muted"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                    <Button
                      type="button"
                      onClick={() => {
                        setSheetTarget({
                          problemId: p.id,
                          problemTitle: p.title,
                          isRevision: false,
                        });
                        setSheetOpen(true);
                      }}
                      className="min-h-[44px] text-xs"
                    >
                      <PlusCircle className="h-3.5 w-3.5 mr-1" />
                      Log
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Q2: Revision */}
        <div className="rounded-xl border border-border bg-card p-4 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <h2 className="text-sm font-semibold">2. Revision</h2>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-lg border border-border p-3">
                <div className="text-2xl font-semibold text-destructive">
                  {data.studyToday.overdueCount}
                </div>
                <div className="text-[11px] text-muted-foreground">Overdue</div>
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="text-2xl font-semibold text-foreground">
                  {data.studyToday.dueTodayCount}
                </div>
                <div className="text-[11px] text-muted-foreground">Due today</div>
              </div>
            </div>
          </div>

          <Link
            href="/dsa/revision"
            className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground px-4 min-h-[44px] text-xs font-medium"
          >
            Open Revision Queue
            <ArrowRight className="h-4 w-4 ml-1.5" />
          </Link>
        </div>
      </div>

      {/* Q3: Topics covered */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">3. Topics Covered</h2>
            <p className="text-xs text-muted-foreground">
              Covered: <strong>{data.topicsSummary.covered}</strong> · In progress:{" "}
              <strong>{data.topicsSummary.inProgress}</strong> · Remaining:{" "}
              <strong>{data.topicsSummary.remaining}</strong>
            </p>
          </div>
          <Link
            href="/dsa/topics"
            className="text-xs font-medium text-primary hover:underline min-h-[44px] inline-flex items-center"
          >
            Manage topics
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {data.topicsSummary.perTopic.map((t) => {
            const pct = t.total > 0 ? Math.round((t.attempted / t.total) * 100) : 0;
            return (
              <div key={t.id} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="truncate font-medium">{t.name}</span>
                  <span className="font-mono text-muted-foreground shrink-0 ml-2">
                    {t.attempted}/{t.total}
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Q4 & Q5 Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Q4: Struggling */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              4. Struggling ({data.struggling.problems.length})
            </h2>
          </div>

          {data.struggling.topTopics.length > 0 && (
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              <span className="text-muted-foreground">Weak topics:</span>
              {data.struggling.topTopics.slice(0, 4).map((t) => (
                <span
                  key={t.topicId}
                  className="rounded bg-destructive/10 text-destructive px-2 py-0.5 font-medium"
                >
                  {t.topicName} ({t.count})
                </span>
              ))}
            </div>
          )}

          {data.struggling.problems.length === 0 ? (
            <p className="text-xs text-muted-foreground">No struggling problems right now.</p>
          ) : (
            <div className="divide-y divide-border">
              {data.struggling.problems.slice(0, 6).map((p) => (
                <div
                  key={p.id}
                  className="py-2 first:pt-0 last:pb-0 flex items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/dsa/problems/${p.id}`}
                      className="font-medium hover:underline truncate block"
                    >
                      {p.title}
                    </Link>
                    <span className="text-[11px] text-muted-foreground">{p.topicName}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {p.failureCount > 0 && (
                      <span className="rounded bg-destructive/10 text-destructive px-1.5 py-0.5 text-[11px]">
                        {p.failureCount} fails
                      </span>
                    )}
                    {p.lastClassification && (
                      <span
                        className={`rounded px-1.5 py-0.5 text-[11px] ${CLASSIFICATION_META[p.lastClassification].badgeClass}`}
                      >
                        {CLASSIFICATION_META[p.lastClassification].shortLabel}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Q5: Consistency */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">5. Consistency</h2>
            <Link
              href="/dsa/log"
              className="text-xs font-medium text-primary hover:underline min-h-[44px] inline-flex items-center"
            >
              Daily log
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-2.5 text-xs">
            <div className="rounded-lg border border-border p-3">
              <div className="section-label">This Week (Mon–Sun)</div>
              <div className="text-xl font-semibold mt-1">
                {data.consistency.sessionsThisWeek}{" "}
                <span className="text-xs font-normal text-muted-foreground">sessions</span>
              </div>
            </div>
            <div className="rounded-lg border border-border p-3">
              <div className="section-label">Days Since Last</div>
              <div className="text-xl font-semibold mt-1">
                {data.consistency.daysSinceLastSession != null
                  ? `${data.consistency.daysSinceLastSession}d`
                  : "—"}
              </div>
            </div>
          </div>

          <div>
            <div className="section-label mb-1.5">Last 4 Weeks (sessions)</div>
            <div className="grid grid-cols-4 gap-2 text-center text-xs">
              {data.consistency.last4Weeks.map((w) => (
                <div key={w.weekStart} className="rounded-lg border border-border p-2">
                  <div className="text-base font-semibold">{w.count}</div>
                  <div className="text-[10px] font-mono text-muted-foreground">
                    {w.weekStart.slice(5)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity (last 8 attempts) */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <h2 className="text-sm font-semibold">Recent Activity (Last 8 Attempts)</h2>
        {data.recentActivity.length === 0 ? (
          <p className="text-xs text-muted-foreground">No attempts logged yet.</p>
        ) : (
          <div className="divide-y divide-border">
            {data.recentActivity.map((a) => (
              <div
                key={a.id}
                className="py-2 first:pt-0 last:pb-0 flex items-center justify-between gap-2 text-xs"
              >
                <div className="min-w-0">
                  <Link
                    href={`/dsa/problems/${a.problemId}`}
                    className="font-medium hover:underline truncate block"
                  >
                    {a.problemTitle}
                  </Link>
                  <span className="text-[11px] text-muted-foreground">
                    {a.topicName} · {a.attemptDate} · {a.timeSpentMin}m · Conf {a.confidence}/5
                  </span>
                </div>
                <span
                  className={`rounded px-2 py-0.5 text-[11px] font-medium shrink-0 ${CLASSIFICATION_META[a.classification].badgeClass}`}
                >
                  {CLASSIFICATION_META[a.classification].shortLabel}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Weekly Per-Topic Trend (plain numbers/table, no charts) */}
      {weeklyTrend && weeklyTrend.rows.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div>
            <h2 className="text-sm font-semibold">
              Weekly Progress Trend (Independent / Attempted)
            </h2>
            <p className="text-xs text-muted-foreground">
              Mon–Sun weeks in owner timezone
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left py-2 pr-3 font-medium">Topic</th>
                  {weeklyTrend.weekStarts.map((ws) => (
                    <th key={ws} className="text-right py-2 px-2 font-mono font-medium">
                      {ws.slice(5)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {weeklyTrend.rows.map((row) => (
                  <tr key={row.topicId}>
                    <td className="py-2 pr-3 font-medium whitespace-nowrap">
                      {row.topicName}
                    </td>
                    {row.cells.map((cell) => (
                      <td
                        key={cell.weekStart}
                        className="py-2 px-2 text-right font-mono text-muted-foreground"
                      >
                        {cell.attempted === 0
                          ? "—"
                          : `${cell.independent}/${cell.attempted}`}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AttemptLogSheet
        target={sheetTarget}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        defaultDate={data.todayStr}
      />
    </div>
  );
}
