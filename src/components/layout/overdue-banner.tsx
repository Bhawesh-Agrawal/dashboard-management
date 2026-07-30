import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";

export async function OverdueBanner() {
  const userId = await getCurrentUserId();
  const now = new Date();

  const overdueCount = await prisma.task.count({
    where: {
      status: "open",
      dueDate: { lt: now },
      OR: [{ userId }, { userId: null }],
    },
  });

  if (overdueCount === 0) return null;

  return (
    <div className="bg-destructive/10 border-b border-destructive/20 px-4 py-2 text-xs sm:text-sm font-medium text-destructive">
      <div className="max-w-5xl mx-auto flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 truncate">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="truncate">
            You have <strong className="font-semibold">{overdueCount}</strong> overdue task{overdueCount > 1 ? "s" : ""} requiring attention.
          </span>
        </div>
        <Link
          href="/tasks"
          className="inline-flex items-center gap-1 shrink-0 font-medium hover:underline text-destructive"
        >
          <span>View Tasks</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
