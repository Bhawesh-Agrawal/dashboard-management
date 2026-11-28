"use client";

import { useEffect, useState, useTransition } from "react";
import { Bot, Check, Loader2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  deleteAllConversationsAction,
  getAiSettingsAction,
  testAiConnectionAction,
  updateAiSettingsAction,
} from "@/features/assistant/lib/conversation-actions";

export function AIProviderSettings() {
  const [status, setStatus] = useState<{
    configured: boolean;
    available: boolean;
    model?: string;
  } | null>(null);
  const [pending, startTransition] = useTransition();

  const [assistantEnabled, setAssistantEnabled] = useState(true);
  const [assistantDsaAccess, setAssistantDsaAccess] = useState(false);
  const [dailyCap, setDailyCap] = useState(200000);
  const [usageToday, setUsageToday] = useState({ requestsToday: 0, tokensToday: 0 });
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    void getAiSettingsAction()
      .then((res) => {
        setAssistantEnabled(res.prefs.assistantEnabled);
        setAssistantDsaAccess(res.prefs.assistantDsaAccess);
        setDailyCap(res.prefs.aiDailyTokenCap);
        setUsageToday({
          requestsToday: res.usage.requestsToday,
          tokensToday: res.usage.tokensToday,
        });
      })
      .catch(() => {});
  }, []);

  function handleTest() {
    startTransition(async () => {
      const result = await testAiConnectionAction();
      setStatus(result);
    });
  }

  async function handleSavePrefs(next: {
    assistantEnabled?: boolean;
    assistantDsaAccess?: boolean;
    aiDailyTokenCap?: number;
  }) {
    const updated = await updateAiSettingsAction(next);
    setAssistantEnabled(updated.assistantEnabled);
    setAssistantDsaAccess(updated.assistantDsaAccess);
    setDailyCap(updated.aiDailyTokenCap);
    toast.success("AI settings saved");
  }

  async function handleDeleteAll() {
    const res = await deleteAllConversationsAction();
    setConfirmClear(false);
    toast.success(`Deleted ${res.deleted} conversation${res.deleted === 1 ? "" : "s"}`);
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="section-label mb-2">AI Assistant & Provider (OpenRouter)</h2>
        <p className="text-xs text-muted-foreground">
          Questions and data returned by assistant tools are sent to OpenRouter and the selected model provider.
        </p>
      </div>

      {/* Assistant Toggles */}
      <div className="space-y-3 rounded-lg border border-border bg-card p-4">
        <label className="flex min-h-[44px] items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">Enable AI Assistant</p>
            <p className="text-xs text-muted-foreground">
              Allow tool-using chat on /ask and quick AI helpers.
            </p>
          </div>
          <input
            type="checkbox"
            checked={assistantEnabled}
            onChange={(e) => void handleSavePrefs({ assistantEnabled: e.target.checked })}
            className="h-5 w-5 accent-primary"
          />
        </label>

        <label className="flex min-h-[44px] items-center justify-between gap-3 border-t border-border pt-3">
          <div>
            <p className="text-sm font-medium text-foreground">
              Let the assistant read my DSA data
            </p>
            <p className="text-xs text-muted-foreground">
              Shares due/overdue revisions, programme day, topic progress, last-7-day attempt counts, and weak topics (read-only).
            </p>
          </div>
          <input
            type="checkbox"
            checked={assistantDsaAccess}
            onChange={(e) => void handleSavePrefs({ assistantDsaAccess: e.target.checked })}
            className="h-5 w-5 accent-primary"
          />
        </label>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <div>
            <p className="text-sm font-medium text-foreground">Daily Token Cap</p>
            <p className="text-xs text-muted-foreground">
              Today: {usageToday.requestsToday} requests · {usageToday.tokensToday.toLocaleString()} tokens
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1000}
              max={2000000}
              step={5000}
              value={dailyCap}
              onChange={(e) => setDailyCap(Number(e.target.value) || 200000)}
              className="w-28 min-h-[44px] rounded-md border border-input bg-background px-2.5 text-sm"
            />
            <button
              type="button"
              onClick={() => void handleSavePrefs({ aiDailyTokenCap: dailyCap })}
              className="min-h-[44px] rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground"
            >
              Save
            </button>
          </div>
        </div>
      </div>

      {/* Connection Test & Model */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-lg border border-border bg-card">
        <div className="flex items-center gap-3">
          <Bot className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Connection Status</p>
            <p className="text-xs text-muted-foreground">
              {status === null
                ? "Not tested yet (click to run 1-token check)"
                : status.configured && status.available
                ? `Connected (${status.model ?? "configured"})`
                : status.configured
                ? "API key set but connection failed"
                : "API key not configured"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {status && (
            <span
              className={`flex items-center gap-1 text-xs ${
                status.available ? "text-primary" : "text-destructive"
              }`}
            >
              {status.available ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
              {status.available ? "OK" : "Error"}
            </span>
          )}
          <button
            type="button"
            onClick={handleTest}
            disabled={pending}
            className="min-h-[44px] px-4 rounded-md border border-border text-sm hover:bg-muted transition-colors disabled:opacity-50 inline-flex items-center gap-2"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Test Connection
          </button>
        </div>
      </div>

      {/* Delete All Conversations */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
        <div>
          <p className="text-sm font-medium text-foreground">Conversation History</p>
          <p className="text-xs text-muted-foreground">
            Remove all saved assistant conversations from your account.
          </p>
        </div>
        {confirmClear ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setConfirmClear(false)}
              className="min-h-[44px] rounded-md border border-border px-3 text-xs"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleDeleteAll()}
              className="min-h-[44px] rounded-md bg-destructive px-3 text-xs font-medium text-destructive-foreground"
            >
              Confirm Delete All
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmClear(true)}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium text-destructive hover:bg-muted"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            Delete all conversations
          </button>
        )}
      </div>
    </div>
  );
}
