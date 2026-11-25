"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  GraduationCap,
  Repeat,
  FileText,
  Settings,
  Briefcase,
  Search,
  Newspaper,
  GitBranch,
  Code2,
} from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const moreSections = [
  {
    label: "Academics",
    items: [
      { label: "Reviews", href: "/reviews", icon: Newspaper },
      { label: "Semesters", href: "/semesters", icon: GraduationCap },
      { label: "Routines", href: "/routines", icon: Repeat },
      { label: "Notes", href: "/notes", icon: FileText },
      { label: "Graph", href: "/notes/graph", icon: GitBranch },
    ],
  },
  {
    label: "Manage",
    items: [
      { label: "DSA", href: "/dsa", icon: Code2 },
      { label: "Projects", href: "/projects", icon: Briefcase },
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
      <SheetTrigger render={children as React.ReactElement} />

      <SheetContent side="bottom" className="h-[75vh] rounded-t-2xl px-4 pt-3 pb-8">
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
