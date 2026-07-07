"use client";

import { Link } from "next-view-transitions";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Calendar, CheckSquare, FolderKanban, Users, BookOpen, Search } from "lucide-react";

const tabs = [
  { label: "TODAY", href: "/today", icon: Calendar },
  { label: "TASKS", href: "/tasks", icon: CheckSquare },
  { label: "PROJECTS", href: "/projects", icon: FolderKanban },
  { label: "PEOPLE", href: "/people", icon: Users },
  { label: "LIBRARY", href: "/library", icon: BookOpen },
  { label: "SEARCH", href: "/search", icon: Search },
];

export function MobileTabs() {
  const pathname = usePathname();

  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-50 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
      <div className="flex items-center justify-around py-1 sm:py-2">
        {tabs.map((tab) => {
          const isActive =
            pathname === tab.href || pathname.startsWith(tab.href + "/");
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex flex-col items-center gap-0.5 sm:gap-1 px-2 sm:px-3 py-2 min-w-[48px] min-h-[48px] text-[0.6rem] sm:text-[0.65rem] transition-colors",
                isActive
                  ? "text-foreground font-medium"
                  : "text-muted-foreground"
              )}
            >
              <tab.icon className="h-5 w-5 sm:h-5 sm:w-5" />
              <span className="truncate">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
