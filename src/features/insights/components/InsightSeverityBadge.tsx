import { cn } from "@/lib/utils";
import type { InsightSeverity } from "@prisma/client";

const severityStyles: Record<InsightSeverity, string> = {
  critical: "bg-[#E54D2E]/10 text-[#E54D2E]",
  warning: "bg-[#C49B5C]/10 text-[#C49B5C]",
  info: "bg-[#6B7FA3]/10 text-[#6B7FA3]",
};

export function InsightSeverityBadge({
  severity,
}: {
  severity: InsightSeverity;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-[0.625rem] font-medium uppercase tracking-wider",
        severityStyles[severity]
      )}
    >
      {severity}
    </span>
  );
}
