"use client";

import { useState } from "react";
import { RefreshCw, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { useSync } from "@/lib/sync/provider";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SyncStatusIndicator({ className }: { className?: string }) {
  const {
    isOnline,
    isSyncing,
    dirtyCount,
    lastSuccessAt,
    lastError,
    syncNow,
  } = useSync();
  const [open, setOpen] = useState(false);

  const label = isSyncing
    ? "Syncing"
    : lastError
      ? "Sync problem"
      : dirtyCount > 0
        ? `${dirtyCount} change${dirtyCount === 1 ? "" : "s"} waiting`
        : isOnline
          ? "Synced"
          : "Offline";

  const Icon = isSyncing
    ? RefreshCw
    : lastError
      ? AlertCircle
      : dirtyCount > 0 || !isOnline
        ? Clock
        : CheckCircle2;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <button
            type="button"
            aria-label={`Sync status: ${label}`}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent transition-colors min-h-[44px]",
              lastError && "border-destructive/50 text-destructive",
              className
            )}
          >
            <Icon className={cn("h-3.5 w-3.5 shrink-0", isSyncing && "animate-spin")} />
            <span>{label}</span>
          </button>
        }
      />
      <SheetContent side="bottom" className="rounded-t-2xl p-5 space-y-4">
        <SheetTitle className="text-base font-semibold text-foreground">
          Sync status
        </SheetTitle>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">State</span>
            <span className="font-medium text-foreground">{label}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Pending changes</span>
            <span className="font-medium text-foreground">{dirtyCount}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Last synced</span>
            <span className="font-medium text-foreground">
              {lastSuccessAt
                ? new Date(lastSuccessAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "Not yet"}
            </span>
          </div>
          {lastError && (
            <div className="rounded-md border border-border bg-muted/50 p-3 text-xs text-destructive">
              Last error: {lastError}
            </div>
          )}
        </div>
        <Button
          type="button"
          onClick={() => void syncNow()}
          disabled={isSyncing || !isOnline}
          className="w-full min-h-[44px]"
        >
          <RefreshCw className={cn("h-4 w-4 mr-2", isSyncing && "animate-spin")} />
          {isSyncing ? "Syncing..." : "Sync now"}
        </Button>
      </SheetContent>
    </Sheet>
  );
}
