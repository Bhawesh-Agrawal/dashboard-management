"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import type { ReviewType } from "@prisma/client";

const FILTERS: { label: string; value: ReviewType | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Weekly", value: "weekly" },
  { label: "Monthly", value: "monthly" },
  { label: "Quarterly", value: "quarterly" },
];

export function ReviewTypeFilter({
  activeType,
}: {
  activeType: ReviewType | "all";
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleFilter(value: ReviewType | "all") {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") {
      params.delete("type");
    } else {
      params.set("type", value);
    }
    router.push(`/reviews?${params.toString()}`);
  }

  return (
    <div className="flex gap-1 overflow-x-auto pb-1">
      {FILTERS.map((filter) => (
        <button
          key={filter.value}
          onClick={() => handleFilter(filter.value)}
          className={cn(
            "px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors",
            activeType === filter.value
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          )}
        >
          {filter.label}
        </button>
      ))}
    </div>
  );
}
