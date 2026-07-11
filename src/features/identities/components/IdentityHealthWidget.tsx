import { Target } from "lucide-react";
import { getIdentityProgress } from "../lib/actions";
import { IdentityCard } from "./IdentityCard";

export async function IdentityHealthWidget({
  userId,
}: {
  userId: string;
}) {
  const progress = await getIdentityProgress(userId);

  if (progress.length === 0) return null;

  // Top 3 by strength
  const top3 = progress.slice(0, 3);

  // Find neglected: lowest strength or status=neglected
  const neglected = progress.find((p) => p.identity.status === "neglected");
  const lowestStrength = progress.find(
    (p) => !top3.some((t) => t.identity.id === p.identity.id)
  );
  const neglectedCandidate = neglected ?? lowestStrength;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="section-label flex items-center gap-1.5">
          <Target className="h-3 w-3" />
          IDENTITY HEALTH
        </p>
      </div>

      <div className="space-y-0.5">
        {top3.map((p) => (
          <IdentityCard key={p.identity.id} progress={p} compact />
        ))}
      </div>

      {neglectedCandidate &&
        !top3.some((t) => t.identity.id === neglectedCandidate.identity.id) && (
          <div className="mt-3 pt-3 border-t border-[#E5E2DD]">
            <p className="text-[0.625rem] text-muted-foreground/70 uppercase tracking-widest mb-2">
              Needs attention
            </p>
            <IdentityCard
              progress={neglectedCandidate}
              compact
            />
          </div>
        )}
    </div>
  );
}
