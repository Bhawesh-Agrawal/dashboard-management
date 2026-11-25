"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const DSA_LINKS = [
  { href: "/dsa", label: "Overview", exact: true },
  { href: "/dsa/topics", label: "Topics", exact: false },
  { href: "/dsa/problems", label: "Problems", exact: false },
  { href: "/dsa/revision", label: "Revision", exact: false },
  { href: "/dsa/log", label: "Daily Log", exact: false },
  { href: "/dsa/report", label: "Tutor Report", exact: false },
  { href: "/dsa/contests", label: "Contests", exact: false },
  { href: "/dsa/settings", label: "Settings", exact: false },
];

export function DsaNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="DSA Navigation"
      className="-mx-4 px-4 sm:mx-0 sm:px-0 mb-6 overflow-x-auto scrollbar-none border-b border-border"
    >
      <div className="flex items-center gap-1 min-w-max pb-2">
        {DSA_LINKS.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "inline-flex items-center justify-center rounded-md px-3 py-2 text-xs font-medium min-h-[44px] whitespace-nowrap transition-colors touch-manipulation",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
