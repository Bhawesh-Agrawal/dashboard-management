"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/features/auth/lib/actions";
import { cn } from "@/lib/utils";
import {
  Calendar,
  CheckSquare,
  CalendarDays,
  GraduationCap,
  Repeat,
  FileText,
  Briefcase,
  DollarSign,
  BookOpen,
  Users,
  Search,
  MessageSquare,
  Settings,
  LogOut,
  Newspaper,
  GitBranch,
} from "lucide-react";
import { DailyNoteButton } from "@/features/notes/components/DailyNoteButton";

const navItems = [
  { label: "Today", href: "/today", icon: Calendar },
  { label: "Tasks", href: "/tasks", icon: CheckSquare },
  { label: "Calendar", href: "/calendar", icon: CalendarDays },
  { label: "Reviews", href: "/reviews", icon: Newspaper },
  { label: "Semesters", href: "/semesters", icon: GraduationCap },
  { label: "Routines", href: "/routines", icon: Repeat },
  { label: "Notes", href: "/notes", icon: FileText },
  { label: "Graph", href: "/notes/graph", icon: GitBranch },
  { label: "Projects", href: "/projects", icon: Briefcase },
  { label: "Budget", href: "/budget", icon: DollarSign },
  { label: "Library", href: "/library", icon: BookOpen },
  { label: "People", href: "/people", icon: Users },
  { label: "Search", href: "/search", icon: Search },
  { label: "Ask", href: "/ask", icon: MessageSquare },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 border-r border-sidebar-border bg-sidebar">
      {/* Wordmark */}
      <div className="flex flex-col px-6 pt-8 pb-6">
        <h1 className="font-serif text-xl font-bold tracking-tight text-sidebar-foreground">
          Academic
        </h1>
        <p className="text-[0.65rem] tracking-[0.2em] uppercase text-muted-foreground mt-0.5">
          Command Center
        </p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 space-y-0.5">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                isActive
                  ? "sidebar-link-active"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50"
              )}
            >
              <item.icon className="h-4 w-4 shrink-0 opacity-60" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Daily Note */}
      <div className="px-3 mt-4">
        <DailyNoteButton variant="sidebar" />
      </div>

      {/* Bottom actions */}
      <div className="border-t border-sidebar-border px-3 py-3 space-y-0.5">
        <button
          onClick={() => {
            document.dispatchEvent(
              new KeyboardEvent("keydown", { key: "k", metaKey: true })
            );
          }}
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors w-full"
        >
          <Search className="h-4 w-4 shrink-0 opacity-60" />
          Search
          <kbd className="ml-auto px-1.5 py-0.5 rounded border border-sidebar-border bg-sidebar text-[0.6rem] text-muted-foreground">
            ⌘K
          </kbd>
        </button>
        <Link
          href="/settings"
          className={cn(
            "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
            pathname === "/settings"
              ? "sidebar-link-active"
              : "text-sidebar-foreground hover:bg-sidebar-accent/50"
          )}
        >
          <Settings className="h-4 w-4 shrink-0 opacity-60" />
          Settings
        </Link>
        <form action={logout}>
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors"
          >
            <LogOut className="h-4 w-4 shrink-0 opacity-60" />
            Sign Out
          </button>
        </form>
      </div>
    </aside>
  );
}
