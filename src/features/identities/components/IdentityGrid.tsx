import { getIdentityProgress } from "../lib/actions";
import { IdentityCard } from "./IdentityCard";

export async function IdentityGrid({ userId }: { userId: string }) {
  const progress = await getIdentityProgress(userId);

  if (progress.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-muted-foreground mb-1">No identities yet</p>
        <p className="text-xs text-muted-foreground/70">
          Define who you&apos;re becoming. Your routines will reinforce that identity.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {progress.map((p) => (
        <IdentityCard key={p.identity.id} progress={p} />
      ))}
    </div>
  );
}
