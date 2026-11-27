"use client";

import Link from "next/link";
import type { BriefKindV2 } from "@/features/briefs/lib/payload-v2";

export interface BriefTodaySummary {
  kind: BriefKindV2;
  forDate: string;
  headline?: string;
  nextUpLine?: string | null;
  pushSummary: string;
}

export function BriefTodayCard({
  summary,
}: {
  summary?: BriefTodaySummary | null;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-1.5">
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
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">
            {summary.headline ?? summary.pushSummary}
          </p>
          {summary.nextUpLine && (
            <p className="text-xs text-muted-foreground">{summary.nextUpLine}</p>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Open to generate today&apos;s morning, midday, or evening brief.
        </p>
      )}
    </div>
  );
}
