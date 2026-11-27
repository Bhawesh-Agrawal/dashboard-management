"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Calendar,
  CheckSquare,
  CalendarDays,
  FileText,
  MoreHorizontal,
} from "lucide-react";
import { useIsFullscreenFlowActive } from "@/lib/ui/fullscreen-flow";

const tabs = [
  { label: "Today", href: "/today", icon: Calendar },
  { label: "Tasks", href: "/tasks", icon: CheckSquare },
  { label: "Calendar", href: "/calendar", icon: CalendarDays },
  { label: "Notes", href: "/notes", icon: FileText },
  { label: "More", href: "/more", icon: MoreHorizontal },
];

export function MobileTabs() {
  const pathname = usePathname();
  const hideNav = useIsFullscreenFlowActive();

  if (hideNav) return null;

  return (
    <nav
      aria-label="Mobile navigation"
      className="lg:hidden fixed bottom-0 inset-x-0 z-50 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="grid grid-cols-5 items-center h-14">
        {tabs.map((tab) => {
          const isActive =
            tab.href === "/more"
              ? pathname === "/more" ||
                (!tabs
                  .slice(0, 4)
                  .some(
                    (t) => pathname === t.href || pathname.startsWith(t.href + "/")
                  ) &&
                  pathname !== "/")
              : pathname === tab.href || pathname.startsWith(tab.href + "/");
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 px-1 py-1.5 min-h-[44px] text-[0.65rem] transition-colors touch-manipulation",
                isActive
                  ? "text-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <tab.icon className="h-5 w-5 shrink-0" />
              <span className="truncate max-w-full">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
