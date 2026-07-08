"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Calendar, CheckSquare, CalendarDays, MessageSquare, MoreHorizontal } from "lucide-react";
import { MobileNavSheet } from "./mobile-nav-sheet";
import { useState } from "react";

const tabs = [
  { label: "Today", href: "/today", icon: Calendar },
  { label: "Tasks", href: "/tasks", icon: CheckSquare },
  { label: "Calendar", href: "/calendar", icon: CalendarDays },
  { label: "Ask", href: "/ask", icon: MessageSquare },
];

export function MobileTabs() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  // Check if current path matches any of the main tabs
  const isMainTab = tabs.some(
    (tab) => pathname === tab.href || pathname.startsWith(tab.href + "/")
  );

  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-50 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="flex items-center justify-around py-1 sm:py-2">
        {tabs.map((tab) => {
          const isActive =
            pathname === tab.href || pathname.startsWith(tab.href + "/");
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex flex-col items-center gap-0.5 sm:gap-1 px-2 sm:px-3 py-2 min-w-[56px] min-h-[48px] text-[0.6rem] sm:text-[0.65rem] transition-colors touch-manipulation",
                isActive
                  ? "text-foreground font-medium"
                  : "text-muted-foreground"
              )}
            >
              <tab.icon className="h-5 w-5" />
              <span className="truncate">{tab.label}</span>
            </Link>
          );
        })}

        {/* More tab — SheetTrigger asChild renders this button directly */}
        <MobileNavSheet open={moreOpen} onOpenChange={setMoreOpen}>
          <button
            className={cn(
              "flex flex-col items-center gap-0.5 sm:gap-1 px-2 sm:px-3 py-2 min-w-[56px] min-h-[48px] text-[0.6rem] sm:text-[0.65rem] transition-colors touch-manipulation",
              !isMainTab && pathname !== "/search"
                ? "text-foreground font-medium"
                : "text-muted-foreground"
            )}
          >
            <MoreHorizontal className="h-5 w-5" />
            <span className="truncate">More</span>
          </button>
        </MobileNavSheet>
      </div>
    </nav>
  );
}
