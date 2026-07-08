"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  GraduationCap,
  Repeat,
  FileText,
  Settings,
  Briefcase,
  DollarSign,
  Users,
  BookOpen,
  Search,
} from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const moreSections = [
  {
    label: "Academics",
    items: [
      { label: "Semesters", href: "/semesters", icon: GraduationCap },
      { label: "Routines", href: "/routines", icon: Repeat },
      { label: "Notes", href: "/notes", icon: FileText },
    ],
  },
  {
    label: "Manage",
    items: [
      { label: "Projects", href: "/projects", icon: Briefcase },
      { label: "Budget", href: "/budget", icon: DollarSign },
      { label: "People", href: "/people", icon: Users },
      { label: "Library", href: "/library", icon: BookOpen },
    ],
  },
  {
    label: "System",
    items: [
      { label: "Search", href: "/search", icon: Search },
      { label: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

export function MobileNavSheet({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* Use SheetTrigger with render prop so it renders the children (button)
          directly as the trigger element — no extra wrapper button nesting.
          Double-button nesting is invalid HTML and breaks iOS tap events. */}
      <SheetTrigger render={children as React.ReactElement} />

      <SheetContent side="bottom" className="h-[70vh] rounded-t-xl">
        <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
        <div className="overflow-y-auto h-full pt-2 pb-8">
          {moreSections.map((section, idx) => (
            <div key={idx} className={cn("px-4", idx > 0 && "mt-6")}>
              <p className="section-label mb-2">{section.label}</p>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    pathname.startsWith(item.href + "/");
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => onOpenChange(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-md px-3 py-3 text-sm transition-colors min-h-[44px] touch-manipulation",
                        isActive
                          ? "bg-accent text-foreground font-medium"
                          : "text-foreground hover:bg-accent/50"
                      )}
                    >
                      <item.icon className="h-5 w-5 opacity-60" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
