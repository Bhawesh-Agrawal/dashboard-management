"use client";

import { useState } from "react";
import { refreshInsights } from "@/features/dashboard/lib/actions";
import { RefreshCw, AlertCircle } from "lucide-react";

function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function AiInsights({
  initialInsights
}: {
  initialInsights?: { insights: string[]; refreshedAt: string } | null;
}) {
  const [insights, setInsights] = useState<string[]>(initialInsights?.insights || []);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(initialInsights?.refreshedAt || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRefresh() {
    setLoading(true);
    setError(null);

    try {
      const result = await refreshInsights();
      if (result.ok) {
        setInsights(result.data.insights);
        setRefreshedAt(result.data.refreshedAt);
      } else {
        setError(result.error);
      }
    } catch {
      setError("Failed to generate insights.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="section-label">AI INSIGHTS</p>
        <div className="flex items-center gap-2">
          {refreshedAt && (
            <span className="text-xs text-muted-foreground">
              {timeAgo(refreshedAt)}
            </span>
          )}
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/5 p-2 rounded-md mb-2">
          <AlertCircle className="h-3 w-3 shrink-0" />
          {error}
        </div>
      )}

      {!loading && insights.length === 0 && !error && (
        <p className="text-sm text-muted-foreground">
          Click refresh to generate insights from your data.
        </p>
      )}

      {insights.length > 0 && (
        <ul className="space-y-2">
          {insights.map((insight, i) => (
            <li key={i} className="text-sm flex gap-2">
              <span className="text-muted-foreground shrink-0">•</span>
              <span>{insight}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
