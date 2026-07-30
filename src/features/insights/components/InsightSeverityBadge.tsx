import { cn } from "@/lib/utils";
import { Trophy } from "lucide-react";
import type { InsightSeverity } from "@prisma/client";

const severityStyles: Record<InsightSeverity, string> = {
  critical: "bg-[#E54D2E]/10 text-[#E54D2E]",
  warning: "bg-[#C49B5C]/10 text-[#C49B5C]",
  info: "bg-[#6B7FA3]/10 text-[#6B7FA3]",
  positive: "bg-[#7A9E7E]/10 text-[#7A9E7E]",
};

export function InsightSeverityBadge({
  severity,
}: {
  severity: InsightSeverity;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-[0.625rem] font-medium uppercase tracking-wider gap-1",
        severityStyles[severity]
      )}
    >
      {severity === "positive" && <Trophy className="h-2.5 w-2.5" />}
      {severity}
    </span>
  );
}
