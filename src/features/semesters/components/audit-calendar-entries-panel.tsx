"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { updateAcademicCalendarEntry } from "../lib/calendar-actions";
import {
  auditCalendarEntries,
  type CalendarAuditFinding,
  type AuditableCalendarEntry,
} from "../lib/calendar-audit";

export function AuditCalendarEntriesPanel({
  semesterEndDate,
  entries,
}: {
  semesterEndDate?: string;
  entries: AuditableCalendarEntry[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [findings, setFindings] = useState<CalendarAuditFinding[] | null>(null);

  function handleAudit() {
    const res = auditCalendarEntries(entries, { semesterEndDate });
    setFindings(res);
    if (res.length === 0) {
      toast.success("All academic calendar entries look clean.");
    }
  }

  function applyFix(
    finding: CalendarAuditFinding,
    patch: { endDate?: string; title?: string }
  ) {
    startTransition(async () => {
      try {
        const nextEndDate = patch.endDate ?? finding.entry.endDate;
        const nextTitle = patch.title ?? finding.entry.title;
        await updateAcademicCalendarEntry(finding.entry.id, {
          kind: finding.entry.kind,
          title: nextTitle,
          startDate: finding.entry.startDate,
          endDate: nextEndDate,
          cancelsClasses: finding.entry.cancelsClasses,
          followsWeekday: finding.entry.followsWeekday,
          notes: finding.entry.notes ?? null,
        });
        toast.success("Updated calendar entry");
        setFindings((prev) =>
          prev ? prev.filter((f) => f.entry.id !== finding.entry.id) : prev
        );
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to apply fix");
      }
    });
  }

  return (
    <section className="mt-6 rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-medium text-foreground">Audit entries</h2>
          <p className="text-xs text-muted-foreground">
            Check existing entries for long ranges, dates past semester end, or leftover
            dates in titles. Changes apply only when you confirm.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={handleAudit}
          disabled={isPending}
          className="min-h-[44px]"
        >
          Audit entries
        </Button>
      </div>

      {findings && findings.length > 0 && (
        <div className="space-y-2 border-t border-border pt-3">
          {findings.map((finding) => (
            <div
              key={finding.entry.id}
              className="rounded-md border border-border bg-background p-3 space-y-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {finding.entry.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {finding.entry.startDate} to {finding.entry.endDate}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {finding.suggestedEndDate && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isPending}
                      onClick={() =>
                        applyFix(finding, { endDate: finding.suggestedEndDate })
                      }
                      className="min-h-[44px]"
                    >
                      Fix end date ({finding.suggestedEndDate})
                    </Button>
                  )}
                  {finding.suggestedTitle && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isPending}
                      onClick={() =>
                        applyFix(finding, { title: finding.suggestedTitle })
                      }
                      className="min-h-[44px]"
                    >
                      Clean title
                    </Button>
                  )}
                </div>
              </div>
              <ul className="space-y-0.5 text-xs text-destructive">
                {finding.issues.map((issue, idx) => (
                  <li key={idx}>{issue.message}</li>
                ))}
              </ul>
              {finding.suggestedTitle && (
                <p className="text-xs text-muted-foreground">
                  Suggested title: <span className="text-foreground">{finding.suggestedTitle}</span>
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
