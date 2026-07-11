import { Sparkles, CheckCircle } from "lucide-react";
import { getInsights } from "../lib/actions";
import { InsightCard } from "./InsightCard";

export async function InsightFeed() {
  const insights = await getInsights("default-user");

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="section-label flex items-center gap-1.5">
          <Sparkles className="h-3 w-3" />
          INSIGHTS YOU MIGHT BE IGNORING
        </p>
        {insights.length > 0 && (
          <span className="inline-flex items-center rounded-full bg-[#E5E2DD] px-1.5 py-0.5 text-[0.625rem] font-medium text-[#6B6B6B]">
            {insights.length}
          </span>
        )}
      </div>

      {insights.length === 0 ? (
        <div className="flex flex-col items-center py-6 text-center">
          <CheckCircle className="h-8 w-8 text-[#7A9E7E] mb-2" />
          <p className="text-sm text-muted-foreground">
            All clear! No ignored insights detected.
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
