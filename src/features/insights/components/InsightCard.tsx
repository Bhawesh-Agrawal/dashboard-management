"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Check, X, ChevronDown, ChevronUp, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { InsightSeverityBadge } from "./InsightSeverityBadge";
import { markInsightActedOn, dismissInsight } from "../lib/actions";
import type { IgnoredInsight, InsightSeverity } from "@prisma/client";
import type { InsightEvidence } from "@/types";

const borderColor: Record<InsightSeverity, string> = {
  critical: "border-l-[#E54D2E]",
  warning: "border-l-[#C49B5C]",
  info: "border-l-[#6B7FA3]",
  positive: "border-l-[#7A9E7E]",
};

function timeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function EvidenceItem({ item }: { item: InsightEvidence }) {
  return (
    <div className="flex items-start gap-2 text-xs text-muted-foreground">
      <span className="shrink-0 font-medium text-foreground/70">
        {item.metric.replace(/_/g, " ")}
      </span>
      <span className="shrink-0">—</span>
      <span>
        {item.value}
        {item.threshold !== "none" && item.threshold !== "baseline" && (
          <> (threshold: {item.threshold})</>
        )}
      </span>
    </div>
  );
}

export function InsightCard({ insight }: { insight: IgnoredInsight }) {
  const [actedOn, setActedOn] = useState(insight.actedOn);
  const [dismissed, setDismissed] = useState(false);
  const [showAllEvidence, setShowAllEvidence] = useState(false);

  const evidence = (insight.evidence as unknown as InsightEvidence[]) ?? [];
  const visibleEvidence = showAllEvidence ? evidence : evidence.slice(0, 2);

  async function handleActedOn() {
    setActedOn(true);
    await markInsightActedOn(insight.id);
  }

  async function handleDismiss() {
    setDismissed(true);
    await dismissInsight(insight.id);
  }

  if (dismissed) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={cn(
        "group rounded-lg border border-[#E5E2DD] border-l-[3px] bg-white p-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm",
        borderColor[insight.severity],
        actedOn && "bg-[#7A9E7E]/5",
        insight.severity === "positive" && "bg-[#7A9E7E]/5"
      )}
    >
      {/* Header */}
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <InsightSeverityBadge severity={insight.severity} />
        <span className="flex items-center gap-1 text-[0.625rem] text-muted-foreground">
          <Clock className="h-2.5 w-2.5" />
          {timeAgo(insight.createdAt)}
        </span>
      </div>

      {/* Title */}
      <p className="mb-1 text-sm font-medium leading-snug text-foreground">
        {insight.title}
      </p>

      {/* Description */}
      <p className="mb-2 text-xs leading-relaxed text-muted-foreground">
        {insight.description}
      </p>

      {/* Evidence */}
      {evidence.length > 0 && (
        <div className="mb-2 space-y-1">
          {visibleEvidence.map((item, i) => (
            <EvidenceItem key={i} item={item} />
          ))}
          {evidence.length > 2 && (
            <button
              onClick={() => setShowAllEvidence(!showAllEvidence)}
              className="flex items-center gap-0.5 text-[0.625rem] text-muted-foreground hover:text-foreground transition-colors"
            >
              {showAllEvidence ? (
                <>
                  <ChevronUp className="h-2.5 w-2.5" />
                  Show less
                </>
              ) : (
                <>
                  <ChevronDown className="h-2.5 w-2.5" />
                  Show {evidence.length - 2} more
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Actions */}
      {!actedOn && (
        <div className="flex items-center gap-1 pt-1 border-t border-[#E5E2DD]/50">
          <Button
            variant="ghost"
            size="xs"
            onClick={handleActedOn}
            className="gap-1 text-muted-foreground hover:text-[#7A9E7E]"
          >
            <Check className="h-3 w-3" />
            Acted On
          </Button>
          <Button
            variant="ghost"
            size="xs"
            onClick={handleDismiss}
            className="gap-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" />
            Dismiss
          </Button>
        </div>
      )}

      {actedOn && (
        <div className="flex items-center gap-1 pt-1 border-t border-[#7A9E7E]/20">
          <Check className="h-3 w-3 text-[#7A9E7E]" />
          <span className="text-xs text-[#7A9E7E]">Marked as acted on</span>
        </div>
      )}
    </motion.div>
  );
}
