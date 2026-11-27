"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { RepeatedHolidayCandidate } from "../lib/exception-migration";
import {
  convertRepeatedHolidaysAction,
  previewRepeatedHolidaysAction,
} from "../lib/exception-migration-actions";

export function ConvertRepeatedHolidaysPanel({
  semesterId,
}: {
  semesterId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [candidates, setCandidates] = useState<RepeatedHolidayCandidate[] | null>(
    null
  );

  function handleScan() {
    startTransition(async () => {
      try {
        const res = await previewRepeatedHolidaysAction(semesterId);
        setCandidates(res);
        if (res.length === 0) {
          toast.info("No repeated per-class holiday exceptions found.");
        }
      } catch {
        toast.error("Failed to scan repeated exceptions");
      }
    });
  }

  function handleConvert() {
    if (!candidates || candidates.length === 0) return;
    startTransition(async () => {
      try {
        const res = await convertRepeatedHolidaysAction({
          semesterId,
          items: candidates.map((c) => ({
            date: c.date,
            title: c.title,
            exceptionIds: c.exceptionIds,
          })),
        });
        toast.success(
          `Created ${res.createdEntries} holiday entr${
            res.createdEntries === 1 ? "y" : "ies"
          } and cleaned up ${res.removedExceptions} per-class exception(s)`
        );
        setCandidates(null);
        router.refresh();
      } catch {
        toast.error("Failed to convert repeated holidays");
      }
    });
  }

  return (
    <section className="mt-6 rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-medium text-foreground">
            Convert repeated holidays
          </h2>
          <p className="text-xs text-muted-foreground">
            Find dates where every scheduled class was cancelled individually and convert
            them into semester-wide holiday entries.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={handleScan}
          disabled={isPending}
          className="min-h-[44px]"
        >
          Convert repeated holidays
        </Button>
      </div>

      {candidates && candidates.length > 0 && (
        <div className="space-y-3 border-t border-border pt-3">
          <div className="space-y-2">
            {candidates.map((c, idx) => (
              <div
                key={c.date}
                className="flex flex-col gap-2 rounded-md border border-border bg-background p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex flex-1 flex-wrap items-center gap-2">
                  <span className="text-xs font-mono text-muted-foreground">
                    {c.date}
                  </span>
                  <input
                    type="text"
                    value={c.title}
                    onChange={(e) =>
                      setCandidates((prev) =>
                        prev
                          ? prev.map((item, i) =>
                              i === idx ? { ...item, title: e.target.value } : item
                            )
                          : prev
                      )
                    }
                    aria-label={`Holiday title for ${c.date}`}
                    className="rounded-md border border-border bg-card px-2 py-1 text-sm min-h-[44px]"
                  />
                  <span className="text-xs text-muted-foreground">
                    ({c.scheduleCount} class{c.scheduleCount === 1 ? "" : "es"} cancelled)
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    setCandidates((prev) =>
                      prev ? prev.filter((_, i) => i !== idx) : prev
                    )
                  }
                  className="min-h-[44px] text-destructive"
                >
                  Skip
                </Button>
              </div>
            ))}
          </div>

          <div className="flex justify-end">
            <Button
              type="button"
              onClick={handleConvert}
              disabled={isPending}
              className="min-h-[44px]"
            >
              Apply conversion ({candidates.length})
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
