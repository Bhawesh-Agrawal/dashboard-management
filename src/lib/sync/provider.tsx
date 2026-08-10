"use client";

import { createContext, useContext, useEffect, useState, useRef, useCallback } from "react";
import { syncManager } from "./sync-manager";
import { subscribeToRealtime } from "./realtime";

interface SyncContextValue {
  isSeeding: boolean;
  isReady: boolean;
  isOnline: boolean;
  pushDirtyRows: () => Promise<void>;
}

const SyncContext = createContext<SyncContextValue>({
  isSeeding: false,
  isReady: false,
  isOnline: true,
  pushDirtyRows: async () => {},
});

export function useSync() {
  return useContext(SyncContext);
}

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [isSeeding, setIsSeeding] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const pushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Initialize sync on mount ──────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        // Check if Dexie has data (not a fresh device)
        const taskCount = await import("./db").then((m) => m.db.tasks.count());

        if (taskCount === 0) {
          // Fresh device — seed from API
          setIsSeeding(true);
          try {
            await syncManager.seedAll();
          } catch (error) {
            console.error("[SyncProvider] Seed failed:", error);
          }
          setIsSeeding(false);
        }

        if (!cancelled) {
          setIsReady(true);
        }

        // Subscribe to Supabase Realtime
        unsubscribeRef.current = subscribeToRealtime();

        // Push any dirty rows from previous offline sessions
        if (navigator.onLine) {
          syncManager.pushDirtyRows();
        }
      } catch (error) {
        console.error("[SyncProvider] Init failed:", error);
        if (!cancelled) {
          setIsReady(true); // Still mark as ready so UI can render
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      unsubscribeRef.current?.();
      syncManager.destroy();
    };
  }, []);

  // ─── Online/offline detection ──────────────────────────────

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
      // Retry dirty rows when coming back online
      syncManager.pushDirtyRows();
    }

    function handleOffline() {
      setIsOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    setIsOnline(navigator.onLine);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // ─── App foreground detection (retry on visibility change) ─

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "visible" && navigator.onLine) {
        // Debounce: wait 1s after becoming visible
        if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
        pushTimerRef.current = setTimeout(() => {
          syncManager.pushDirtyRows();
        }, 1000);
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    };
  }, []);

  const pushDirtyRows = useCallback(async () => {
    await syncManager.pushDirtyRows();
  }, []);

  return (
    <SyncContext.Provider value={{ isSeeding, isReady, isOnline, pushDirtyRows }}>
      {children}
    </SyncContext.Provider>
  );
}
