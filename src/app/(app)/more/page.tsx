import Link from "next/link";
import { GraduationCap, Repeat, FileText, Briefcase, Settings, LogOut } from "lucide-react";
import { logout } from "@/features/auth/lib/actions";

export const revalidate = 0;

const moreItems = [
  { label: "Semesters", href: "/semesters", icon: GraduationCap },
  { label: "Routines", href: "/routines", icon: Repeat },
  { label: "Notes", href: "/notes", icon: FileText },
  { label: "Projects", href: "/projects", icon: Briefcase },
  { label: "Settings", href: "/settings", icon: Settings },
];

export default function MorePage() {
  return (
    <div>
      <h1 className="page-heading mb-8">More</h1>
      <div className="space-y-0.5">
        {moreItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="list-row items-center"
          >
            <item.icon className="h-4 w-4 text-muted-foreground" />
            <span className="flex-1 text-sm font-medium">{item.label}</span>
          </Link>
        ))}
        <form action={logout}>
          <button
            type="submit"
            className="list-row items-center w-full text-left"
          >
            <LogOut className="h-4 w-4 text-muted-foreground" />
            <span className="flex-1 text-sm font-medium text-destructive">Sign Out</span>
          </button>
        </form>
      </div>
    </div>
  );
}
