"use client";

import Link from "next/link";

export interface BriefTodaySummary {
  kind: "morning" | "evening";
  forDate: string;
  pushSummary: string;
}

export function BriefTodayCard({
  summary,
}: {
  summary?: BriefTodaySummary | null;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="section-label">Daily Brief</h3>
        <Link
          href="/brief"
          className="text-xs text-primary hover:underline min-h-[44px] inline-flex items-center"
        >
          Open
        </Link>
      </div>
      {summary ? (
        <p className="text-sm text-foreground">{summary.pushSummary}</p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Open to generate today&apos;s morning or evening brief.
        </p>
      )}
    </div>
  );
}
