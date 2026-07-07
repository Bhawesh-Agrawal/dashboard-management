"use client";

import Link from "next/link";
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
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-50 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex items-center justify-around py-2">
        {tabs.map((tab) => {
          const isActive =
            pathname === tab.href || pathname.startsWith(tab.href + "/");
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex flex-col items-center gap-1 px-3 py-1 text-[0.65rem] transition-colors",
                isActive
                  ? "text-foreground font-medium"
                  : "text-muted-foreground"
              )}
            >
              <tab.icon className="h-5 w-5" />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
