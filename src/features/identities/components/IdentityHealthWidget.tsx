import { Target, TrendingUp, TrendingDown, ArrowRight } from "lucide-react";
import Link from "next/link";
import { getIdentityProgress } from "../lib/actions";
import { IdentityCard } from "./IdentityCard";
import type { IdentityProgress } from "../lib/actions";

function SpotlightCard({ progress }: { progress: IdentityProgress }) {
  const { identity, strength, trend, daysSinceLastActivity } = progress;
  const color = identity.color || "#6B7FA3";

  return (
    <Link
      href={`/routines/identities/${identity.id}`}
      className="block rounded-lg border border-border bg-card p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm"
      style={{ borderLeftColor: color, borderLeftWidth: 3 }}
    >
      <div className="flex items-center gap-2 mb-2">
        <Target className="h-3.5 w-3.5" style={{ color }} />
        <p className="section-label">IDENTITY SPOTLIGHT</p>
      </div>
      <p className="text-sm font-medium leading-snug text-foreground mb-2">
        {identity.statement}
      </p>
      <div className="flex items-center gap-4 text-[0.625rem] text-muted-foreground">
        <span className="flex items-center gap-1">
          {trend === "up" ? (
            <TrendingUp className="h-3 w-3 text-[#7A9E7E]" />
          ) : trend === "down" ? (
            <TrendingDown className="h-3 w-3 text-[#C4868C]" />
          ) : null}
          {strength}%
        </span>
        <span className="flex items-center gap-1">
          {daysSinceLastActivity !== null
            ? `${daysSinceLastActivity === 0 ? "today" : `${daysSinceLastActivity}d ago`}`
            : "never"}
        </span>
      </div>
    </Link>
  );
}

function NeglectedAlert({ progress }: { progress: IdentityProgress }) {
  const { identity, strength, daysSinceLastActivity } = progress;
  const color = identity.color || "#C4868C";
  const daysSince = daysSinceLastActivity;

  return (
    <Link
      href={`/routines/identities/${identity.id}`}
      className="block rounded-lg border border-[#C4868C]/30 bg-[#C4868C]/5 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm"
      style={{ borderLeftColor: color, borderLeftWidth: 3 }}
    >
      <div className="flex items-center gap-2 mb-2">
        <TrendingDown className="h-3.5 w-3.5 text-[#C4868C]" />
        <p className="section-label text-[#C4868C]">NEEDS ATTENTION</p>
      </div>
      <p className="text-sm font-medium leading-snug text-foreground mb-1">
        {identity.statement}
      </p>
      <p className="text-xs text-muted-foreground mb-2">
        {daysSince !== null
          ? `Last activity ${daysSince === 0 ? "today" : `${daysSince}d ago`}`
          : "No activity yet"}
        {" · "}Strength {strength}%
      </p>
      <span className="inline-flex items-center gap-1 text-xs font-medium text-[#C4868C]">
        Reconnect <ArrowRight className="h-3 w-3" />
      </span>
    </Link>
  );
}

function LevelUpCelebration({ progress }: { progress: IdentityProgress }) {
  const { identity, strength } = progress;
  const color = identity.color || "#7A9E7E";

  return (
    <Link
      href={`/routines/identities/${identity.id}`}
      className="block rounded-lg border border-[#7A9E7E]/30 bg-[#7A9E7E]/5 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm"
      style={{ borderLeftColor: color, borderLeftWidth: 3 }}
    >
      <div className="flex items-center gap-2 mb-2">
        <TrendingUp className="h-3.5 w-3.5 text-[#7A9E7E]" />
        <p className="section-label text-[#7A9E7E]">LEVELING UP</p>
      </div>
      <p className="text-sm font-medium leading-snug text-foreground mb-1">
        {identity.statement}
      </p>
      <p className="text-xs text-muted-foreground">
        Strength now at {strength}% — keep the momentum going
      </p>
    </Link>
  );
}

export async function IdentityHealthWidget({
  userId,
}: {
  userId: string;
}) {
  const progress = await getIdentityProgress(userId);

  if (progress.length === 0) return null;

  // Classify identities
  const neglected = progress.find(
    (p) =>
      p.identity.status === "neglected" ||
      (p.trend === "down" && p.strength < 30)
  );

  const levelingUp = progress.find(
    (p) =>
      p.trend === "up" &&
      p.strength >= 50 &&
      p.identity.status !== "integrated"
  );

  const top3 = progress.slice(0, 3);
  const spotlight =
    neglected && !top3.some((t) => t.identity.id === neglected.identity.id)
      ? neglected
      : top3[0];

  return (
    <div>
      {/* Neglected alert — highest priority */}
      {neglected && (
        <div className="mb-3">
          <NeglectedAlert progress={neglected} />
        </div>
      )}

      {/* Level-up celebration */}
      {levelingUp && (
        <div className="mb-3">
          <LevelUpCelebration progress={levelingUp} />
        </div>
      )}

      {/* Spotlight — featured identity */}
      {spotlight && (
        <div className="mb-3">
          <SpotlightCard progress={spotlight} />
        </div>
      )}

      {/* Compact list of remaining top identities */}
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
      </div>
    </div>
  );
}
