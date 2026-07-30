import { Sparkles, CheckCircle } from "lucide-react";
import { getInsights } from "../lib/actions";
import { InsightCard } from "./InsightCard";
import { RefreshButton } from "./refresh-button";
import { DailyQuote } from "@/features/dashboard/components/daily-quote";
import { prisma } from "@/lib/prisma";

import { getCurrentUserId } from "@/lib/auth";

export async function UnifiedInsights() {
  const userId = await getCurrentUserId();
  const [insights, quotes] = await Promise.all([
    getInsights(userId),
    prisma.quote.findMany({
      select: { id: true, text: true, source: true },
    }),
  ]);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="section-label flex items-center gap-1.5">
          <Sparkles className="h-3 w-3" />
          INSIGHTS
        </p>
        <div className="flex items-center gap-2">
          {insights.length > 0 && (
            <span className="inline-flex items-center rounded-full bg-[#E5E2DD] px-1.5 py-0.5 text-[0.625rem] font-medium text-[#6B6B6B]">
              {insights.length}
            </span>
          )}
          <RefreshButton />
        </div>
      </div>

      {/* Daily Quote — always visible at top of insights */}
      {quotes.length > 0 && (
        <div className="mb-4 p-3 rounded-lg bg-[#F8F6F3] border border-[#E5E2DD]">
          <DailyQuote quotes={quotes} />
        </div>
      )}

      {insights.length === 0 ? (
        <div className="flex flex-col items-center py-6 text-center">
          <CheckCircle className="h-8 w-8 text-[#7A9E7E] mb-2" />
          <p className="text-sm text-muted-foreground">
            All clear! No insights detected.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {insights.map((insight) => (
            <InsightCard key={insight.id} insight={insight} />
          ))}
        </div>
      )}
    </div>
  );
}
