"use client";

import { ThemeProvider } from "next-themes";
import { SyncProvider, useSync } from "@/lib/sync/provider";

function SeedLoadingGate({ children }: { children: React.ReactNode }) {
  const { isSeeding, isReady } = useSync();

  if (!isReady) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
          <p className="text-sm text-muted-foreground">
            {isSeeding ? "Syncing your data..." : "Loading..."}
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <SyncProvider>
        <SeedLoadingGate>{children}</SeedLoadingGate>
      </SyncProvider>
    </ThemeProvider>
  );
}
