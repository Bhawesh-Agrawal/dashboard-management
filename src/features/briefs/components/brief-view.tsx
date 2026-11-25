"use client";

import { useState, useTransition, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { regenerateBriefAction } from "@/features/briefs/lib/actions";
import { pinTravelDocuments } from "@/features/briefs/lib/pin-tickets";
import type { BriefPayload } from "@/features/briefs/lib/build";
import { toast } from "sonner";

export interface StoredBriefItem {
  kind: "morning" | "evening";
  forDate: string;
  generatedAt: string;
  payload: BriefPayload;
}

function BriefCard({
  label,
  kind,
  brief,
  onRegenerated,
}: {
  label: string;
  kind: "morning" | "evening";
  brief: StoredBriefItem | null;
  onRegenerated: (next: StoredBriefItem) => void;
}) {
  const [isPending, startTransition] = useTransition();

  function handleRegenerate() {
    startTransition(async () => {
      const res = await regenerateBriefAction(kind);
      if (res.success && res.payload) {
        onRegenerated({
          kind,
          forDate: res.payload.forDate,
          generatedAt: new Date().toISOString(),
          payload: res.payload,
        });
        toast.success(`${label} updated`);
      } else {
        toast.error(res.error ?? "Failed to regenerate brief");
      }
    });
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-border">
        <div>
          <h2 className="page-heading text-lg">{label}</h2>
          {brief ? (
            <p className="text-xs text-muted-foreground mt-0.5">
              For {brief.forDate} · Updated {new Date(brief.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mt-0.5">Not generated yet</p>
          )}
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={handleRegenerate}
          disabled={isPending}
          className="min-h-[44px]"
        >
          {isPending ? "Generating..." : "Regenerate now"}
        </Button>
      </div>

      {!brief ? (
        <EmptyState
          title={`No ${label.toLowerCase()} yet`}
          description="Tap Regenerate now to build this brief from your current schedule, tasks, and DSA queue."
        />
      ) : (
        <div className="space-y-5">
          {brief.payload.weatherLine && (
            <div className="text-sm text-foreground border-b border-border pb-3">
              <span className="section-label mr-2">Weather</span>
              <span>{brief.payload.weatherLine}</span>
            </div>
          )}

          {brief.payload.earliestCommitment && (
            <div className="text-sm text-foreground border-b border-border pb-3">
              <span className="section-label mr-2">Earliest Tomorrow</span>
              <span className="font-medium">{brief.payload.earliestCommitment}</span>
            </div>
          )}

          {brief.payload.sections.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing scheduled in this window.</p>
          ) : (
            <div className="space-y-5">
              {brief.payload.sections.map((section) => (
                <div key={section.id} className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="section-label">{section.title}</h3>
                    <Link
                      href={section.linkHref}
                      className="text-xs text-primary hover:underline min-h-[44px] inline-flex items-center"
                    >
                      {section.linkLabel}
                    </Link>
                  </div>

                  <ul className="divide-y divide-border rounded-lg border border-border bg-background overflow-hidden">
                    {section.items.map((item, idx) => (
                      <li key={idx} className="p-3 space-y-1">
                        <div className="flex items-baseline justify-between gap-2">
                          {item.href ? (
                            <Link
                              href={item.href}
                              className="text-sm font-medium text-foreground hover:underline"
                            >
                              {item.label}
                            </Link>
                          ) : (
                            <span className="text-sm font-medium text-foreground">
                              {item.label}
                            </span>
                          )}
                        </div>
                        {item.meta && (
                          <p className="text-xs text-muted-foreground">{item.meta}</p>
                        )}
                        {item.documents && item.documents.length > 0 && (
                          <div className="flex flex-wrap gap-2 pt-1">
                            {item.documents.map((doc) => (
                              <Link
                                key={doc.noteId}
                                href={`/notes/${doc.noteId}`}
                                className="text-xs text-primary underline min-h-[44px] inline-flex items-center"
                              >
                                Open ticket: {doc.title}
                              </Link>
                            ))}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export function BriefView({
  initialMorning,
  initialEvening,
}: {
  initialMorning: StoredBriefItem | null;
  initialEvening: StoredBriefItem | null;
}) {
  const [morning, setMorning] = useState<StoredBriefItem | null>(initialMorning);
  const [evening, setEvening] = useState<StoredBriefItem | null>(initialEvening);

  useEffect(() => {
    void pinTravelDocuments([morning?.payload, evening?.payload]);
  }, [morning, evening]);

  return (
    <div className="space-y-6">
      <BriefCard
        label="Morning Brief"
        kind="morning"
        brief={morning}
        onRegenerated={setMorning}
      />
      <BriefCard
        label="Evening Brief"
        kind="evening"
        brief={evening}
        onRegenerated={setEvening}
      />
    </div>
  );
}
