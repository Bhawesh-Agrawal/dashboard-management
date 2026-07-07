"use client";

import { useState, useTransition } from "react";
import { checkAIAvailability } from "@/lib/ai/openrouter";
import { Bot, Check, X, Loader2 } from "lucide-react";

export function AIProviderSettings() {
  const [status, setStatus] = useState<{
    configured: boolean;
    available: boolean;
  } | null>(null);
  const [pending, startTransition] = useTransition();

  async function handleTest() {
    startTransition(async () => {
      const result = await checkAIAvailability();
      setStatus(result);
    });
  }

  return (
    <div>
      <h2 className="section-label mb-3">AI Provider (OpenRouter)</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Powers the Ask chat and Quick Capture NLP parsing. Uses an open-weight model via OpenRouter.
      </p>

      <div className="space-y-4">
        <div className="flex items-center justify-between p-4 rounded-md border border-input">
          <div className="flex items-center gap-3">
            <Bot className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Connection Status</p>
              <p className="text-xs text-muted-foreground">
                {status === null
                  ? "Not tested yet"
                  : status.configured && status.available
                  ? "Connected and working"
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
                  status.available ? "text-green-600" : "text-destructive"
                }`}
              >
                {status.available ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <X className="h-3 w-3" />
                )}
                {status.available ? "OK" : "Error"}
              </span>
            )}
            <button
              onClick={handleTest}
              disabled={pending}
              className="h-9 px-4 rounded-md border border-input text-sm hover:bg-muted transition-colors disabled:opacity-50 inline-flex items-center gap-2"
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              Test Connection
            </button>
          </div>
        </div>

        <div className="text-xs text-muted-foreground bg-muted/50 rounded-md p-3">
          <p className="font-medium mb-1">Configuration</p>
          <p>
            Set your OpenRouter API key in the{" "}
            <code className="px-1 py-0.5 rounded bg-muted text-foreground">
              OPENROUTER_API_KEY
            </code>{" "}
            environment variable. The model defaults to{" "}
            <code className="px-1 py-0.5 rounded bg-muted text-foreground">
              openai/gpt-oss-120b
            </code>{" "}
            but can be overridden with{" "}
            <code className="px-1 py-0.5 rounded bg-muted text-foreground">
              OPENROUTER_MODEL
            </code>.
          </p>
        </div>
      </div>
    </div>
  );
}
