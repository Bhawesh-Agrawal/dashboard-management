"use client";

import { useState } from "react";
import { List, Network } from "lucide-react";

type ViewMode = "list" | "graph";

export function NotesViewToggle() {
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  const handleToggle = (mode: ViewMode) => {
    setViewMode(mode);
    // Emit custom event for parent components to listen
    window.dispatchEvent(new CustomEvent("notes-view-change", { detail: mode }));
  };

  return (
    <div className="flex items-center gap-1 border border-border rounded-md p-0.5">
      <button
        onClick={() => handleToggle("list")}
        className={`p-1.5 rounded transition-colors ${
          viewMode === "list"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
        title="List view"
      >
        <List className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={() => handleToggle("graph")}
        className={`p-1.5 rounded transition-colors ${
          viewMode === "graph"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
        title="Graph view"
      >
        <Network className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
