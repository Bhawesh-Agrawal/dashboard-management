"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import {
  getGoogleCalendarAccountsAction,
  getGoogleCalendarAuthUrl,
  disconnectGoogleAccountAction,
  refreshGoogleAccountCalendarsAction,
  toggleGoogleCalendarSubscriptionAction,
} from "@/features/calendar/lib/google-actions";
import type { ConnectedGoogleAccountInfo } from "@/features/calendar/lib/google-calendar";
import { Calendar, Plus, RefreshCw, Trash2, Loader2, Check } from "lucide-react";

export function GoogleCalendarSettings() {
  const [accounts, setAccounts] = useState<ConnectedGoogleAccountInfo[] | null>(null);
  const [pending, startTransition] = useTransition();
  const [busyAccountId, setBusyAccountId] = useState<string | null>(null);

  const loadAccounts = useCallback(async () => {
    const res = await getGoogleCalendarAccountsAction();
    setAccounts(res.accounts);
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  async function handleAddAccount() {
    startTransition(async () => {
      const { url } = await getGoogleCalendarAuthUrl();
      window.location.href = url;
    });
  }

  async function handleDisconnectAccount(account: ConnectedGoogleAccountInfo) {
    if (!confirm(`Disconnect ${account.email}? Events from this account will no longer sync.`)) {
      return;
    }
    setBusyAccountId(account.id);
    await disconnectGoogleAccountAction(account.id);
    await loadAccounts();
    setBusyAccountId(null);
  }

  async function handleRefreshCalendars(accountId: string) {
    setBusyAccountId(accountId);
    await refreshGoogleAccountCalendarsAction(accountId);
    await loadAccounts();
    setBusyAccountId(null);
  }

  async function handleToggleCalendar(
    accountId: string,
    subscriptionId: string,
    enabled: boolean
  ) {
    // Optimistically update UI
    setAccounts((prev) =>
      prev
        ? prev.map((acc) =>
            acc.id === accountId
              ? {
                  ...acc,
                  calendars: acc.calendars.map((cal) =>
                    cal.id === subscriptionId ? { ...cal, enabled } : cal
                  ),
                }
              : acc
          )
        : prev
    );

    const res = await toggleGoogleCalendarSubscriptionAction(subscriptionId, enabled);
    if (!res.success) {
      await loadAccounts();
    }
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="section-label mb-1">Google Calendar Sync</h2>
          <p className="text-sm text-muted-foreground">
            Connect one or more Google accounts and choose which calendars to sync (read-only).
          </p>
        </div>

        <button
          onClick={handleAddAccount}
          disabled={pending}
          className="h-9 px-3.5 rounded-md border border-input text-sm hover:bg-muted transition-colors inline-flex items-center gap-2 shrink-0 disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
          {accounts && accounts.length > 0 ? "Add Google Account" : "Connect Google"}
        </button>
      </div>

      {accounts === null ? (
        <div className="flex items-center gap-2 p-4 rounded-md border border-input text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking connected accounts...
        </div>
      ) : accounts.length === 0 ? (
        <div className="flex items-center justify-between p-4 rounded-md border border-input">
          <div className="flex items-center gap-3">
            <Calendar className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">No Google accounts connected</p>
              <p className="text-xs text-muted-foreground">
                Connect an account to sync events and birthdays into your calendar.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {accounts.map((account) => {
            const enabledCount = account.calendars.filter((c) => c.enabled).length;
            const isBusy = busyAccountId === account.id;

            return (
              <div
                key={account.id}
                className="rounded-md border border-input overflow-hidden"
              >
                <div className="flex items-center justify-between p-4 bg-card">
                  <div className="flex items-center gap-3 min-w-0">
                    <Calendar className="h-5 w-5 text-primary shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{account.email}</p>
                      <p className="text-xs text-muted-foreground">
                        {enabledCount} of {account.calendars.length}{" "}
                        {account.calendars.length === 1 ? "calendar" : "calendars"} syncing
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleRefreshCalendars(account.id)}
                      disabled={isBusy}
                      title="Refresh calendar list"
                      className="h-8 px-2.5 rounded-md border border-input text-xs hover:bg-muted transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${isBusy ? "animate-spin" : ""}`} />
                      Refresh
                    </button>
                    <button
                      onClick={() => handleDisconnectAccount(account)}
                      disabled={isBusy}
                      className="h-8 px-2.5 rounded-md border border-border text-xs text-destructive hover:bg-destructive/10 transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Disconnect
                    </button>
                  </div>
                </div>

                {account.calendars.length > 0 && (
                  <div className="border-t border-input bg-muted/30 px-4 py-3 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      Select calendars to sync:
                    </p>
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      {account.calendars.map((cal) => (
                        <label
                          key={cal.id}
                          className="flex items-center gap-2.5 p-2 rounded-md hover:bg-muted/60 cursor-pointer text-xs select-none"
                        >
                          <input
                            type="checkbox"
                            checked={cal.enabled}
                            onChange={(e) =>
                              handleToggleCalendar(account.id, cal.id, e.target.checked)
                            }
                            className="h-3.5 w-3.5 rounded border-input accent-primary"
                          />
                          <span
                            className="h-2.5 w-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: cal.color || "#4285f4" }}
                          />
                          <span className="truncate flex-1">{cal.summary}</span>
                          {cal.isPrimary && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                              Primary
                            </span>
                          )}
                          {cal.isBirthday && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                              Birthdays
                            </span>
                          )}
                          {cal.enabled && <Check className="h-3 w-3 text-primary shrink-0" />}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
