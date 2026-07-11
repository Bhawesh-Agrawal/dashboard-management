"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { refreshAllInsights } from "../lib/actions";

export function RefreshButton() {
  const [loading, setLoading] = useState(false);

  async function handleRefresh() {
    setLoading(true);
    try {
      await refreshAllInsights();
      window.location.reload();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleRefresh}
      disabled={loading}
      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
    >
      <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
      Refresh
    </button>
  );
}
