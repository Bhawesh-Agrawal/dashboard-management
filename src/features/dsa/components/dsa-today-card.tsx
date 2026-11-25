"use client";

import Link from "next/link";
import { ArrowRight, Code2 } from "lucide-react";
import type { DsaDueSummary } from "../lib/summary";

export function DsaTodayCard({ summary }: { summary?: DsaDueSummary | null }) {
  if (!summary || !summary.isConfigured) {
    return null;
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Code2 className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">DSA</h3>
        </div>
        <Link
          href="/dsa"
          className="text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          Dashboard
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="rounded-lg border border-border p-2.5">
          <div className="text-lg font-semibold text-amber-600 dark:text-amber-400">
            {summary.dueToday}
          </div>
          <div className="text-[11px] text-muted-foreground">Due today</div>
        </div>
        <div className="rounded-lg border border-border p-2.5">
          <div
            className={`text-lg font-semibold ${
              summary.overdue > 0 ? "text-destructive" : ""
            }`}
          >
            {summary.overdue}
          </div>
          <div className="text-[11px] text-muted-foreground">Overdue</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/dsa/problems"
          className="flex-1 inline-flex items-center justify-center rounded-lg border border-border px-3 min-h-[44px] text-xs font-medium hover:bg-muted"
        >
          Log attempt
        </Link>
        <Link
          href="/dsa/revision"
          className="flex-1 inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground px-3 min-h-[44px] text-xs font-medium"
        >
          Open revision
          <ArrowRight className="h-3.5 w-3.5 ml-1" />
        </Link>
      </div>
    </div>
  );
}
