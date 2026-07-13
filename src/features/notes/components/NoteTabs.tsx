"use client";

import { FileText, BookOpen, Link as LinkIcon, Star } from "lucide-react";
import { cn } from "@/lib/utils";

export type TabValue = "all" | "documents" | "links" | "favorites";

export interface TabItem {
  value: TabValue;
  label: string;
  icon: React.ReactNode;
  count: number;
}

export interface NoteTabsProps {
  activeTab: TabValue;
  onTabChange: (tab: TabValue) => void;
  counts: {
    all: number;
    documents: number;
    links: number;
    favorites: number;
  };
}

const TABS: Omit<TabItem, "count">[] = [
  { value: "all", label: "All Notes", icon: <FileText className="h-3.5 w-3.5" /> },
  { value: "documents", label: "Documents", icon: <BookOpen className="h-3.5 w-3.5" /> },
  { value: "links", label: "Links", icon: <LinkIcon className="h-3.5 w-3.5" /> },
  { value: "favorites", label: "Favorites", icon: <Star className="h-3.5 w-3.5" /> },
];

export function NoteTabs({ activeTab, onTabChange, counts }: NoteTabsProps) {
  const tabs: TabItem[] = TABS.map((tab) => ({
    ...tab,
    count: counts[tab.value],
  }));

  return (
    <div className="flex gap-1 p-1 bg-muted rounded-md overflow-x-auto scrollbar-none">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          onClick={() => onTabChange(tab.value)}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-2 sm:py-1.5 sm:px-3 rounded-sm text-sm whitespace-nowrap transition-colors min-h-[44px] sm:min-h-0 shrink-0",
            activeTab === tab.value
              ? "bg-background text-foreground font-medium shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <span className="h-4 w-4 sm:h-3.5 sm:w-3.5 shrink-0">{tab.icon}</span>
          <span className="hidden sm:inline">{tab.label}</span>
          {tab.count > 0 && (
            <span className={cn(
              "text-[0.65rem] px-1.5 py-0.5 rounded-full",
              activeTab === tab.value
                ? "bg-primary/10 text-primary"
                : "bg-muted-foreground/10 text-muted-foreground"
            )}>
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
