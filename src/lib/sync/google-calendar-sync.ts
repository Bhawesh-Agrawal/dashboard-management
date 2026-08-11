"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";

interface GoogleCalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date | null;
  location: string | null;
  description: string | null;
  htmlLink: string;
  isBirthday: boolean;
  calendarId: string;
}

interface GoogleCalendarSyncState {
  isSyncing: boolean;
  lastSyncTime: Date | null;
  error: string | null;
}

const SYNC_INTERVAL = 15 * 60 * 1000; // 15 minutes
const CACHE_TABLE = "googleCalendarEvents";

// Add the table to Dexie (we'll need to update the schema)
// For now, we'll use a separate approach with localStorage as a simple cache

export function useGoogleCalendarSync(userId: string | null) {
  const [syncState, setSyncState] = useState<GoogleCalendarSyncState>({
    isSyncing: false,
    lastSyncTime: null,
    error: null,
  });
  const syncTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSyncRef = useRef<Date | null>(null);

  // Fetch and cache Google Calendar events
  const fetchAndCacheEvents = useCallback(async () => {
    if (!userId || syncState.isSyncing) return;

    setSyncState(prev => ({ ...prev, isSyncing: true, error: null }));

    try {
      const now = new Date();
      const startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const endDate = new Date(now.getFullYear(), now.getMonth() + 3, 0);

      const response = await fetch(
        `/api/sync/google-calendar?start=${startDate.toISOString()}&end=${endDate.toISOString()}`,
        {
          credentials: "include",
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch Google Calendar: ${response.status}`);
      }

      const data = await response.json();
      const events = data.events || [];

      // Cache in localStorage for quick access
      localStorage.setItem(
        "googleCalendarEvents",
        JSON.stringify({
          events,
          lastSync: now.toISOString(),
        })
      );

      lastSyncRef.current = now;
      setSyncState({
        isSyncing: false,
        lastSyncTime: now,
        error: null,
      });
    } catch (error) {
      console.error("[GoogleCalendarSync] Failed:", error);
      setSyncState(prev => ({
        ...prev,
        isSyncing: false,
        error: error instanceof Error ? error.message : "Sync failed",
      }));
    }
  }, [userId, syncState.isSyncing]);

  // Get cached events (from localStorage)
  const getCachedEvents = useCallback((): GoogleCalendarEvent[] => {
    try {
      const cached = localStorage.getItem("googleCalendarEvents");
      if (!cached) return [];

      const data = JSON.parse(cached);
      return data.events || [];
    } catch {
      return [];
    }
  }, []);

  // Start background sync
  useEffect(() => {
    if (!userId) return;

    // Initial sync
    fetchAndCacheEvents();

    // Set up periodic sync
    syncTimerRef.current = setInterval(fetchAndCacheEvents, SYNC_INTERVAL);

    return () => {
      if (syncTimerRef.current) {
        clearInterval(syncTimerRef.current);
      }
    };
  }, [userId, fetchAndCacheEvents]);

  // Sync when app becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && userId) {
        const now = new Date();
        const timeSinceLastSync = lastSyncRef.current
          ? now.getTime() - lastSyncRef.current.getTime()
          : Infinity;

        // Sync if more than 5 minutes since last sync
        if (timeSinceLastSync > 5 * 60 * 1000) {
          fetchAndCacheEvents();
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [userId, fetchAndCacheEvents]);

  return {
    ...syncState,
    getCachedEvents,
    forceSync: fetchAndCacheEvents,
  };
}
