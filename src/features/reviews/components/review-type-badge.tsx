import { cn } from "@/lib/utils";
import type { ReviewType } from "@prisma/client";

const TYPE_STYLES: Record<ReviewType, string> = {
  daily: "bg-amber-100 text-amber-800",
  weekly: "bg-blue-100 text-blue-800",
  monthly: "bg-emerald-100 text-emerald-800",
  quarterly: "bg-purple-100 text-purple-800",
};

const TYPE_LABELS: Record<ReviewType, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
};

export function ReviewTypeBadge({
  type,
  className,
}: {
  type: ReviewType;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-[0.625rem] font-medium tracking-wide uppercase",
        TYPE_STYLES[type],
        className
      )}
    >
      {TYPE_LABELS[type]}
    </span>
  );
}
