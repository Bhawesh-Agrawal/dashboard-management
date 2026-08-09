"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar } from "lucide-react";
import { getOrCreateDailyNote } from "@/features/notes/lib/actions-import";
import { cn } from "@/lib/utils";

type DailyNoteButtonProps = {
  variant?: "sidebar" | "header";
  className?: string;
};

export function DailyNoteButton({ variant = "sidebar", className }: DailyNoteButtonProps) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const today = new Date();
  const dateLabel = today.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  async function handleClick() {
    setLoading(true);
    try {
      const result = await getOrCreateDailyNote();
      if (result.ok) {
        router.push(`/notes/${result.data.id}`);
      }
    } finally {
      setLoading(false);
    }
  }

  if (variant === "header") {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className={cn(
          "inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-md border border-border hover:bg-accent transition-colors disabled:opacity-50",
          className
        )}
      >
        <Calendar className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{loading ? "Loading..." : "Today"}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors text-left min-h-[44px] sm:min-h-0",
        "text-sidebar-foreground hover:bg-sidebar-accent/50 disabled:opacity-50",
        className
      )}
    >
      <Calendar className="h-4 w-4 shrink-0 opacity-60" />
      <div className="flex-1 min-w-0">
        <span className="block truncate">Today</span>
        <span className="block text-[0.6rem] text-muted-foreground truncate">
          {dateLabel}
        </span>
      </div>
    </button>
  );
}
