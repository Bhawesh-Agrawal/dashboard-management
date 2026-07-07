"use client";

import Link from "next/link";
import { MoreHorizontal, GraduationCap, Repeat, FileText, Settings } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useState } from "react";

const moreItems = [
  { label: "Semesters", href: "/semesters", icon: GraduationCap },
  { label: "Routines", href: "/routines", icon: Repeat },
  { label: "Notes", href: "/notes", icon: FileText },
  { label: "Settings", href: "/settings", icon: Settings },
];

export function MobileNavSheet() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<button className="p-2 rounded-md hover:bg-accent" />}>
        <MoreHorizontal className="h-5 w-5" />
      </SheetTrigger>
      <SheetContent side="right" className="w-64">
        <nav className="flex flex-col gap-1 mt-8">
          {moreItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
            >
              <item.icon className="h-4 w-4 opacity-60" />
              {item.label}
            </Link>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
