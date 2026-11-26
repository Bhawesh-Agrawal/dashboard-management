"use client";

import { useState, useTransition, useEffect } from "react";
import {
  generateWidgetTokenAction,
  revokeWidgetTokenAction,
  getWidgetTokenStatus,
} from "@/features/widget/lib/actions";
import { Smartphone, Check, X, Loader2, Copy, AlertTriangle } from "lucide-react";

export function WidgetAccessSettings() {
  const [status, setStatus] = useState<{
    exists: boolean;
    lastUsedAt: Date | null;
  } | null>(null);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    getWidgetTokenStatus().then(setStatus);
  }, []);

  async function handleGenerate() {
    if (!confirm("Generate a new widget token? Any existing token will be revoked.")) return;
    startTransition(async () => {
      const result = await generateWidgetTokenAction();
      if (result.token) {
        setGeneratedToken(result.token);
        setStatus({ exists: true, lastUsedAt: null });
      }
    });
  }

  async function handleRevoke() {
    if (!confirm("Revoke the widget token? The Tasker widget will stop working until you generate a new one.")) return;
    startTransition(async () => {
      await revokeWidgetTokenAction();
      setGeneratedToken(null);
      setStatus({ exists: false, lastUsedAt: null });
    });
  }

  function handleCopyToken() {
    if (generatedToken) {
      navigator.clipboard.writeText(generatedToken);
    }
  }

  function handleDismissToken() {
    setGeneratedToken(null);
  }

  return (
    <div>
      <h2 className="section-label mb-3">Widget Access (Tasker / KWGT)</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Generate an API token for the Android home-screen widget. The token is shown once on generation — copy it and store it in Tasker.
      </p>

      <div className="space-y-4">
        <div className="flex items-center justify-between p-4 rounded-md border border-input">
          <div className="flex items-center gap-3">
            <Smartphone className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Widget Token</p>
              <p className="text-xs text-muted-foreground">
                {status === null
                  ? "Checking status..."
                  : status.exists
                  ? status.lastUsedAt
                    ? `Active — last used ${new Date(status.lastUsedAt).toLocaleString()}`
                    : "Active — not used yet"
                  : "No active token"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {status !== null && (
              <span
                className={`flex items-center gap-1 text-xs ${
                  status.exists ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {status.exists ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                {status.exists ? "Active" : "Inactive"}
              </span>
            )}
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : status?.exists ? (
              <button
                onClick={handleRevoke}
                className="h-9 px-4 rounded-md border border-border text-sm hover:bg-accent transition-colors"
              >
                Revoke
              </button>
            ) : (
              <button
                onClick={handleGenerate}
                className="h-9 px-4 rounded-md border border-input text-sm hover:bg-muted transition-colors inline-flex items-center gap-2"
              >
                Generate Token
              </button>
            )}
          </div>
        </div>

        {/* One-time token display */}
        {generatedToken && (
          <div className="p-4 rounded-md border border-border bg-muted/40">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-foreground mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground mb-1">
                  Copy this token now — you won&apos;t see it again
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-background p-2 rounded border border-border break-all font-mono">
                    {generatedToken}
                  </code>
                  <button
                    onClick={handleCopyToken}
                    className="h-8 px-3 rounded border border-border text-xs hover:bg-muted transition-colors inline-flex items-center gap-1 shrink-0"
                  >
                    <Copy className="h-3 w-3" />
                    Copy
                  </button>
                </div>
                <button
                  onClick={handleDismissToken}
                  className="mt-2 text-xs text-muted-foreground hover:text-foreground hover:underline"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="text-xs text-muted-foreground bg-muted/50 rounded-md p-3">
          <p className="font-medium mb-1">Setup instructions</p>
          <p>
            After generating a token, store it in Tasker as a global variable{" "}
            <code className="px-1 py-0.5 rounded bg-muted text-foreground">%WIDGET_TOKEN</code>.
            Set <code className="px-1 py-0.5 rounded bg-muted text-foreground">%WIDGET_BASE</code> to your
            app URL (e.g. <code className="px-1 py-0.5 rounded bg-muted text-foreground">https://your-app.vercel.app</code>).
            Then create a Tasker task to call{" "}
            <code className="px-1 py-0.5 rounded bg-muted text-foreground">GET /api/widget/summary</code> with
            an <code className="px-1 py-0.5 rounded bg-muted text-foreground">Authorization: Bearer</code> header.
          </p>
        </div>
      </div>
    </div>
  );
}
