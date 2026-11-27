import Link from "next/link";
import {
  GraduationCap,
  Repeat,
  Briefcase,
  Settings,
  LogOut,
  Code2,
  Newspaper,
  Search,
  MessageSquare,
} from "lucide-react";
import { logout } from "@/features/auth/lib/actions";

export const revalidate = 0;

const moreSections = [
  {
    label: "Study",
    items: [
      { label: "Semesters & Courses", href: "/semesters", icon: GraduationCap },
      { label: "DSA", href: "/dsa", icon: Code2 },
      { label: "Reviews", href: "/reviews", icon: Newspaper },
    ],
  },
  {
    label: "Tools",
    items: [
      { label: "Search", href: "/search", icon: Search },
      { label: "Ask", href: "/ask", icon: MessageSquare },
      { label: "Projects", href: "/projects", icon: Briefcase },
      { label: "Routines", href: "/routines", icon: Repeat },
    ],
  },
  {
    label: "Settings",
    items: [{ label: "Settings", href: "/settings", icon: Settings }],
  },
];

export default function MorePage() {
  return (
    <div className="space-y-6">
      <h1 className="page-heading">More</h1>

      {moreSections.map((section) => (
        <section key={section.label} className="space-y-2">
          <h2 className="section-label">{section.label}</h2>
          <div className="divide-y divide-border rounded-xl border border-border bg-card overflow-hidden">
            {section.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 px-4 py-3 min-h-[44px] hover:bg-accent/50 transition-colors"
              >
                <item.icon className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="flex-1 text-sm font-medium text-foreground">
                  {item.label}
                </span>
              </Link>
            ))}
          </div>
        </section>
      ))}

      <section className="space-y-2">
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <form action={logout}>
            <button
              type="submit"
              className="flex items-center gap-3 px-4 py-3 min-h-[44px] w-full text-left hover:bg-accent/50 transition-colors"
            >
              <LogOut className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="flex-1 text-sm font-medium text-destructive">
                Sign Out
              </span>
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
