"use client";

import { useState, useTransition, useEffect } from "react";
import {
  checkGoogleCalendarConnection,
  getGoogleCalendarAuthUrl,
  disconnectGoogleCalendarAction,
  getGoogleCalendarCalendars,
} from "@/features/calendar/lib/google-actions";
import { Calendar, Check, X, Loader2, ExternalLink } from "lucide-react";

export function GoogleCalendarSettings() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [calendars, setCalendars] = useState<{ id: string; summary: string; primary: boolean }[]>([]);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    checkGoogleCalendarConnection().then((result) => {
      setConnected(result.connected);
      if (result.connected) {
        getGoogleCalendarCalendars().then((res) => {
          setCalendars(res.calendars);
        });
      }
    });
  }, []);

  async function handleConnect() {
    startTransition(async () => {
      const { url } = await getGoogleCalendarAuthUrl();
      window.open(url, "_blank");
    });
  }

  async function handleDisconnect() {
    if (!confirm("Disconnect Google Calendar? Events will no longer sync.")) return;
    startTransition(async () => {
      await disconnectGoogleCalendarAction();
      setConnected(false);
      setCalendars([]);
    });
  }

  const syncedCalendars = calendars.filter(
    (c) => c.primary || c.summary?.toLowerCase() === "birthdays" || c.id.includes("addressbook#contacts")
  );

  return (
    <div>
      <h2 className="section-label mb-3">Google Calendar Sync</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Sync events from your Google Calendar to the in-app calendar (read-only). Birthdays from your contacts are also synced.
      </p>

      <div className="flex items-center justify-between p-4 rounded-md border border-input">
        <div className="flex items-center gap-3">
          <Calendar className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Google Calendar</p>
            <p className="text-xs text-muted-foreground">
              {connected === null
                ? "Checking status..."
                : connected
                ? "Connected — events are syncing"
                : "Not connected"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {connected !== null && (
            <span
              className={`flex items-center gap-1 text-xs ${
                connected ? "text-primary" : "text-muted-foreground"
              }`}
            >
              {connected ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
              {connected ? "Connected" : "Disconnected"}
            </span>
          )}
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : connected ? (
            <button
              onClick={handleDisconnect}
              className="h-9 px-4 rounded-md border border-border text-sm hover:bg-accent transition-colors"
            >
              Disconnect
            </button>
          ) : (
            <button
              onClick={handleConnect}
              className="h-9 px-4 rounded-md border border-input text-sm hover:bg-muted transition-colors inline-flex items-center gap-2"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Connect
            </button>
          )}
        </div>
      </div>

      {/* Show synced calendars */}
      {connected && syncedCalendars.length > 0 && (
        <div className="mt-3 p-3 rounded-md bg-muted/50">
          <p className="text-xs font-medium mb-2">Synced calendars:</p>
          <div className="space-y-1">
            {syncedCalendars.map((cal) => (
              <div key={cal.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                <Check className="h-3 w-3 text-primary" />
                <span>{cal.summary}</span>
                {cal.primary && <span className="text-muted-foreground/60">(primary)</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
