import { notFound } from "next/navigation";
import { getIdentity, getIdentityProgress } from "@/features/identities/lib/actions";
import { IdentityDetail } from "@/features/identities/components/IdentityDetail";
import { getRoutines } from "@/features/routines/lib/queries";

export const revalidate = 0;

export default async function IdentityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const identity = await getIdentity(id);

  if (!identity) {
    notFound();
  }

  const [progress, allRoutines] = await Promise.all([
    getIdentityProgress(identity.userId),
    getRoutines(),
  ]);
  const identityProgress = progress.find((p) => p.identity.id === id);

  // Routines not linked to any identity, or linked to a different identity
  const unlinkedRoutines = allRoutines.filter(
    (r) => r.identityId === null || r.identityId !== id
  );

  return (
    <div className="max-w-2xl">
      <IdentityDetail
        identity={identity}
        strength={identityProgress?.strength ?? 0}
        trend={identityProgress?.trend ?? "stable"}
        unlinkedRoutines={unlinkedRoutines}
      />
    </div>
  );
}
