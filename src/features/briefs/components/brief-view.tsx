"use client";

import { useState, useTransition, useEffect } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Copy, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { regenerateBriefAction } from "@/features/briefs/lib/actions";
import { pinTravelDocuments } from "@/features/briefs/lib/pin-tickets";
import { maskBriefPayloadForDebug } from "@/features/briefs/lib/debug-mask";
import {
  DEFAULT_CARD_ORDER,
  isBriefPayloadV1,
  isBriefPayloadV2,
  upgradeV1ToV2Fallback,
  type AnyBriefPayload,
  type BriefCardId,
  type BriefKindV2,
  type BriefPayloadV2,
} from "@/features/briefs/lib/payload-v2";
import { toast } from "sonner";

export interface StoredBriefItem {
  kind: BriefKindV2;
  forDate: string;
  generatedAt: string;
  payload: AnyBriefPayload;
}

const DEFAULT_EXPANDED = new Set<BriefCardId>(["nextUp", "weather", "timeline"]);

const CARD_TITLES: Record<BriefCardId, string> = {
  nextUp: "Next Up",
  weather: "Weather & Air Quality",
  timeline: "Timeline",
  deadlines: "Deadlines",
  travel: "Travel & Tickets",
  study: "DSA & Study",
  notes: "Recent Notes",
  nudges: "Setup Nudges",
  quickActions: "Quick Actions",
};

function CollapsibleCard({
  cardId,
  title,
  badge,
  defaultOpen,
  children,
}: {
  cardId: BriefCardId;
  title: string;
  badge?: string;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section
      data-card-id={cardId}
      className="rounded-xl border border-border bg-card overflow-hidden"
    >
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 min-h-[44px] text-left hover:bg-muted/40 transition-colors"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2 min-w-0">
          {open ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          <h3 className="section-label truncate">{title}</h3>
        </div>
        {badge && (
          <span className="text-xs text-muted-foreground shrink-0">{badge}</span>
        )}
      </button>

      {open && <div className="px-4 pb-4 pt-1 border-t border-border">{children}</div>}
    </section>
  );
}

function normalizeToV2(item: StoredBriefItem | null): BriefPayloadV2 | null {
  if (!item) return null;
  if (isBriefPayloadV2(item.payload)) return item.payload;
  if (isBriefPayloadV1(item.payload)) return upgradeV1ToV2Fallback(item.payload);
  return null;
}

export function BriefView({
  initialMorning,
  initialMidday = null,
  initialEvening,
  cardOrder = DEFAULT_CARD_ORDER,
  enabledCards,
  middayEnabled = false,
}: {
  initialMorning: StoredBriefItem | null;
  initialMidday?: StoredBriefItem | null;
  initialEvening: StoredBriefItem | null;
  cardOrder?: BriefCardId[];
  enabledCards?: BriefCardId[];
  middayEnabled?: boolean;
}) {
  const [briefs, setBriefs] = useState<Record<BriefKindV2, StoredBriefItem | null>>({
    morning: initialMorning,
    midday: initialMidday,
    evening: initialEvening,
  });

  const [activeKind, setActiveKind] = useState<BriefKindV2>(() => {
    const hr = new Date().getHours();
    if (hr >= 17) return "evening";
    if (middayEnabled && hr >= 12) return "midday";
    return "morning";
  });

  const [isPending, startTransition] = useTransition();
  const [cooldownSec, setCooldownSec] = useState(0);

  useEffect(() => {
    if (cooldownSec <= 0) return;
    const timer = setInterval(() => {
      setCooldownSec((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownSec]);

  useEffect(() => {
    const payloads = [briefs.morning?.payload, briefs.midday?.payload, briefs.evening?.payload]
      .filter((p): p is AnyBriefPayload => Boolean(p))
      .filter((p) => isBriefPayloadV1(p));
    if (payloads.length > 0) {
      void pinTravelDocuments(payloads);
    }
  }, [briefs]);

  const currentItem = briefs[activeKind];
  const v2 = normalizeToV2(currentItem);

  function handleRegenerate() {
    if (cooldownSec > 0) return;
    startTransition(async () => {
      const res = await regenerateBriefAction(activeKind);
      if (res.success && res.payload) {
        setBriefs((prev) => ({
          ...prev,
          [activeKind]: {
            kind: activeKind,
            forDate: res.payload!.forDate,
            generatedAt: res.payload!.generatedAt,
            payload: res.payload!,
          },
        }));
        setCooldownSec(60);
        toast.success("Brief updated");
      } else {
        if (res.cooldownRemainingSec) {
          setCooldownSec(res.cooldownRemainingSec);
        }
        toast.error(res.error ?? "Failed to regenerate brief");
      }
    });
  }

  async function handleCopyDebug() {
    if (!currentItem) return;
    try {
      const masked = maskBriefPayloadForDebug(currentItem.payload);
      await navigator.clipboard.writeText(JSON.stringify(masked, null, 2));
      toast.success("Masked debug JSON copied");
    } catch {
      toast.error("Could not copy debug info");
    }
  }

  const tabs: { kind: BriefKindV2; label: string }[] = [
    { kind: "morning", label: "Morning" },
    ...(middayEnabled ? [{ kind: "midday" as const, label: "Midday" }] : []),
    { kind: "evening", label: "Evening" },
  ];

  const enabledSet = enabledCards ? new Set(enabledCards) : null;
  const orderedCards = cardOrder.filter((id) => !enabledSet || enabledSet.has(id));

  const updatedHm = currentItem
    ? new Date(currentItem.generatedAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 p-1 bg-muted rounded-md">
          {tabs.map((tab) => {
            const active = activeKind === tab.kind;
            return (
              <button
                key={tab.kind}
                type="button"
                onClick={() => setActiveKind(tab.kind)}
                className={`px-3 py-1.5 rounded text-xs min-h-[44px] transition-colors ${
                  active
                    ? "bg-background text-foreground font-medium shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          {currentItem && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopyDebug}
              className="min-h-[44px]"
            >
              <Copy className="h-3.5 w-3.5 mr-1.5" />
              Copy debug info
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRegenerate}
            disabled={isPending || cooldownSec > 0}
            className="min-h-[44px]"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isPending ? "animate-spin" : ""}`} />
            {isPending
              ? "Generating..."
              : cooldownSec > 0
              ? `Wait ${cooldownSec}s`
              : "Regenerate"}
          </Button>
        </div>
      </div>

      {!v2 ? (
        <div className="rounded-xl border border-border bg-card p-6">
          <EmptyState
            title={`No ${activeKind} brief yet`}
            description="Tap Regenerate to build your brief from your schedule, weather, tasks, and DSA queue."
          />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Hero Headline + Summary */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-2">
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="uppercase tracking-wider font-medium">
                {activeKind} brief · {v2.forDate}
              </span>
              {updatedHm && <span>Updated {updatedHm}</span>}
            </div>
            <h2 className="page-heading text-xl text-foreground">
              {v2.headline?.text ?? "Daily Brief"}
            </h2>
            {v2.summary && (
              <p className="text-sm text-muted-foreground leading-relaxed">
                {v2.summary}
              </p>
            )}
            {v2.isEmptyDay && (
              <p className="text-xs text-muted-foreground pt-1">
                No timed commitments in this window — focus on your study queue, deadlines, and recent notes below.
              </p>
            )}
          </div>

          {/* Ordered Collapsible Cards */}
          {orderedCards.map((cardId) => {
            if (cardId === "nextUp" && v2.nextUp) {
              return (
                <CollapsibleCard
                  key={cardId}
                  cardId={cardId}
                  title={CARD_TITLES[cardId]}
                  badge={`in ${v2.nextUp.minutesRemaining}m`}
                  defaultOpen={DEFAULT_EXPANDED.has(cardId)}
                >
                  <div className="flex items-center justify-between gap-3 pt-2">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {v2.nextUp.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {v2.nextUp.startsAt}
                        {v2.nextUp.location ? ` · ${v2.nextUp.location}` : ""}
                      </p>
                    </div>
                    {v2.nextUp.href && (
                      <Link
                        href={v2.nextUp.href}
                        className="text-xs text-primary hover:underline min-h-[44px] inline-flex items-center"
                      >
                        Open
                      </Link>
                    )}
                  </div>
                </CollapsibleCard>
              );
            }

            if (cardId === "weather" && v2.weather) {
              const w = v2.weather;
              return (
                <CollapsibleCard
                  key={cardId}
                  cardId={cardId}
                  title={CARD_TITLES[cardId]}
                  badge={w.locationName ?? undefined}
                  defaultOpen={DEFAULT_EXPANDED.has(cardId)}
                >
                  <div className="space-y-3 pt-2">
                    {w.unavailableNote && (
                      <p className="text-xs text-destructive">{w.unavailableNote}</p>
                    )}

                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div>
                        {w.currentTempC !== null ? (
                          <span className="text-3xl font-bold tracking-tight text-foreground">
                            {Math.round(w.currentTempC)}°C
                          </span>
                        ) : (
                          <span className="text-sm font-medium text-foreground">
                            {w.summaryLine ?? "Forecast"}
                          </span>
                        )}
                        {w.feelsLikeC !== null && (
                          <span className="text-xs text-muted-foreground ml-2">
                            Feels like {Math.round(w.feelsLikeC)}°C
                          </span>
                        )}
                      </div>
                      {w.tempMinC !== null && w.tempMaxC !== null && (
                        <span className="text-xs text-muted-foreground">
                          Low {Math.round(w.tempMinC)}° · High {Math.round(w.tempMaxC)}°C
                        </span>
                      )}
                    </div>

                    {w.adviceLine && (
                      <p className="text-sm text-foreground font-medium">{w.adviceLine}</p>
                    )}

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {w.sunrise && <span>Sunrise {w.sunrise}</span>}
                      {w.sunset && <span>Sunset {w.sunset}</span>}
                      {w.uvIndexMax !== null && <span>UV max {w.uvIndexMax}</span>}
                      {w.windSpeedMaxKmh !== null && <span>Wind {w.windSpeedMaxKmh} km/h</span>}
                      {w.visibilityMinKm !== null && <span>Vis {w.visibilityMinKm} km</span>}
                    </div>

                    {w.rainWindows.length > 0 && (
                      <p className="text-xs text-foreground">
                        Rain: {w.rainWindows.join(", ")}
                      </p>
                    )}

                    {(w.bestHours || w.worstHours) && (
                      <p className="text-xs text-muted-foreground">
                        {[w.bestHours, w.worstHours].filter(Boolean).join(" · ")}
                      </p>
                    )}

                    {w.fogNote && <p className="text-xs text-muted-foreground">{w.fogNote}</p>}

                    {w.aqi && (
                      <div className="rounded-lg border border-border bg-background p-2.5 text-xs space-y-0.5">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-foreground">
                            US AQI {w.aqi.usAqi} · {w.aqi.category}
                          </span>
                          <span className="text-muted-foreground">PM2.5: {w.aqi.pm25}</span>
                        </div>
                        <p className="text-muted-foreground">{w.aqi.advice}</p>
                      </div>
                    )}

                    {/* 12-hour plain-text / mini-column hourly strip */}
                    {w.hourly.length > 0 && (
                      <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5 pt-1">
                        {w.hourly.slice(0, 12).map((h) => (
                          <div
                            key={h.time}
                            className="rounded-md border border-border bg-background p-1.5 text-center space-y-0.5"
                          >
                            <p className="text-[10px] text-muted-foreground">{h.time}</p>
                            <p className="text-xs font-medium text-foreground">
                              {Math.round(h.tempC)}°
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {h.precipProb}%
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </CollapsibleCard>
              );
            }

            if (cardId === "timeline" && v2.timeline && v2.timeline.length > 0) {
              return (
                <CollapsibleCard
                  key={cardId}
                  cardId={cardId}
                  title={CARD_TITLES[cardId]}
                  badge={`${v2.timeline.filter((t) => t.kind !== "gap").length} items`}
                  defaultOpen={DEFAULT_EXPANDED.has(cardId)}
                >
                  <ul className="divide-y divide-border pt-2">
                    {v2.timeline.map((item) => (
                      <li
                        key={item.id}
                        className="py-2.5 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <p
                            className={`text-sm ${
                              item.kind === "gap"
                                ? "text-muted-foreground italic"
                                : "font-medium text-foreground"
                            }`}
                          >
                            {item.title}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {item.startTime}
                            {item.endTime ? `–${item.endTime}` : ""}
                            {item.location ? ` · ${item.location}` : ""}
                            {item.sourceLabel ? ` · ${item.sourceLabel}` : ""}
                          </p>
                        </div>
                        {item.href && (
                          <Link
                            href={item.href}
                            className="text-xs text-primary hover:underline min-h-[44px] inline-flex items-center shrink-0"
                          >
                            Open
                          </Link>
                        )}
                      </li>
                    ))}
                  </ul>
                </CollapsibleCard>
              );
            }

            if (cardId === "deadlines" && v2.deadlines) {
              const d = v2.deadlines;
              const total =
                d.tasksToday.length +
                d.overdueTotalCount +
                d.tasksWithin3Days.length +
                d.assessmentsWithin7Days.length;
              return (
                <CollapsibleCard
                  key={cardId}
                  cardId={cardId}
                  title={CARD_TITLES[cardId]}
                  badge={`${total} total`}
                  defaultOpen={DEFAULT_EXPANDED.has(cardId)}
                >
                  <div className="space-y-3 pt-2 text-sm">
                    {d.overdueTasks.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-destructive">
                          Overdue ({d.overdueTotalCount})
                        </p>
                        <ul className="space-y-1">
                          {d.overdueTasks.map((t) => (
                            <li key={t.id} className="text-xs text-foreground">
                              {t.title} · due {t.dueDate}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {d.tasksToday.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">Due Today</p>
                        <ul className="space-y-1">
                          {d.tasksToday.map((t) => (
                            <li key={t.id} className="text-xs text-foreground">
                              {t.title}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {d.tasksWithin3Days.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">
                          Next 3 Days
                        </p>
                        <ul className="space-y-1">
                          {d.tasksWithin3Days.map((t) => (
                            <li key={t.id} className="text-xs text-foreground">
                              {t.title} · {t.dueDate}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {d.assessmentsWithin7Days.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">
                          Assessments (7d)
                        </p>
                        <ul className="space-y-1">
                          {d.assessmentsWithin7Days.map((a) => (
                            <li key={a.id} className="text-xs text-foreground">
                              {a.title} ({a.courseName}) · {a.dueDate}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <Link
                      href="/tasks"
                      className="text-xs text-primary hover:underline inline-flex items-center min-h-[44px]"
                    >
                      Open Tasks
                    </Link>
                  </div>
                </CollapsibleCard>
              );
            }

            if (cardId === "travel" && v2.travel && v2.travel.length > 0) {
              return (
                <CollapsibleCard
                  key={cardId}
                  cardId={cardId}
                  title={CARD_TITLES[cardId]}
                  badge={`${v2.travel.length}`}
                  defaultOpen={DEFAULT_EXPANDED.has(cardId)}
                >
                  <ul className="divide-y divide-border pt-2">
                    {v2.travel.map((tr) => (
                      <li key={tr.eventId} className="py-2.5 space-y-1">
                        <p className="text-sm font-medium text-foreground">{tr.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {tr.dateTimeLabel}
                          {tr.location ? ` · ${tr.location}` : ""}
                        </p>
                        {tr.destinationWeather && (
                          <p className="text-xs text-foreground">
                            Destination: {tr.destinationWeather.summary}
                          </p>
                        )}
                        {tr.documents.length > 0 && (
                          <div className="flex flex-wrap gap-2 pt-1">
                            {tr.documents.map((doc) => (
                              <Link
                                key={doc.noteId}
                                href={`/notes/${doc.noteId}`}
                                className="text-xs text-primary underline min-h-[44px] inline-flex items-center"
                              >
                                Open ticket: {doc.title} (offline pinned)
                              </Link>
                            ))}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </CollapsibleCard>
              );
            }

            if (cardId === "study" && v2.study) {
              const s = v2.study;
              return (
                <CollapsibleCard
                  key={cardId}
                  cardId={cardId}
                  title={CARD_TITLES[cardId]}
                  badge={`${s.dueToday + s.overdue} due`}
                  defaultOpen={DEFAULT_EXPANDED.has(cardId)}
                >
                  <div className="pt-2 space-y-2 text-xs">
                    <p className="text-sm font-medium text-foreground">
                      {s.dueToday} due today · {s.overdue} overdue
                    </p>
                    <p className="text-muted-foreground">
                      {s.programmeDay !== null ? `Programme Day ${s.programmeDay} · ` : ""}
                      {s.attemptsLast7Days} attempts in last 7 days
                    </p>
                    {s.topOverdue.length > 0 && (
                      <p className="text-muted-foreground">
                        Top overdue: {s.topOverdue.join(", ")}
                      </p>
                    )}
                    <div className="flex gap-3">
                      <Link
                        href="/dsa/revision"
                        className="text-xs text-primary hover:underline min-h-[44px] inline-flex items-center"
                      >
                        Revision Queue
                      </Link>
                      <Link
                        href="/dsa/log"
                        className="text-xs text-primary hover:underline min-h-[44px] inline-flex items-center"
                      >
                        Log Attempt
                      </Link>
                    </div>
                  </div>
                </CollapsibleCard>
              );
            }

            if (cardId === "notes" && v2.notes && v2.notes.length > 0) {
              return (
                <CollapsibleCard
                  key={cardId}
                  cardId={cardId}
                  title={CARD_TITLES[cardId]}
                  badge={`${v2.notes.length}`}
                  defaultOpen={DEFAULT_EXPANDED.has(cardId)}
                >
                  <ul className="divide-y divide-border pt-2">
                    {v2.notes.map((n) => (
                      <li key={n.id} className="py-2 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {n.title}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Updated {n.updatedAt}
                            {n.courseName ? ` · ${n.courseName}` : ""}
                          </p>
                        </div>
                        <Link
                          href={n.href}
                          className="text-xs text-primary hover:underline min-h-[44px] inline-flex items-center shrink-0"
                        >
                          Resume
                        </Link>
                      </li>
                    ))}
                  </ul>
                </CollapsibleCard>
              );
            }

            if (cardId === "nudges" && v2.nudges && v2.nudges.length > 0) {
              return (
                <CollapsibleCard
                  key={cardId}
                  cardId={cardId}
                  title={CARD_TITLES[cardId]}
                  badge={`${v2.nudges.length}`}
                  defaultOpen={DEFAULT_EXPANDED.has(cardId)}
                >
                  <ul className="divide-y divide-border pt-2">
                    {v2.nudges.map((n) => (
                      <li key={n.id} className="py-2.5 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">{n.title}</p>
                          <p className="text-xs text-muted-foreground">{n.message}</p>
                        </div>
                        <Link
                          href={n.href}
                          className="text-xs text-primary hover:underline min-h-[44px] inline-flex items-center shrink-0"
                        >
                          {n.actionLabel}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </CollapsibleCard>
              );
            }

            if (cardId === "quickActions" && v2.quickActions && v2.quickActions.length > 0) {
              return (
                <CollapsibleCard
                  key={cardId}
                  cardId={cardId}
                  title={CARD_TITLES[cardId]}
                  badge={`${v2.quickActions.length}`}
                  defaultOpen={DEFAULT_EXPANDED.has(cardId)}
                >
                  <div className="flex flex-wrap gap-2 pt-2">
                    {v2.quickActions.map((act) => (
                      <Link
                        key={act.id}
                        href={act.href}
                        className="inline-flex items-center justify-center rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-muted min-h-[44px] transition-colors"
                      >
                        {act.label}
                      </Link>
                    ))}
                  </div>
                </CollapsibleCard>
              );
            }

            return null;
          })}
        </div>
      )}
    </div>
  );
}
