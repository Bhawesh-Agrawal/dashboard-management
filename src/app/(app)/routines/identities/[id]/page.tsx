import { notFound } from "next/navigation";
import { getIdentity, getIdentityProgress } from "@/features/identities/lib/actions";
import { IdentityDetail } from "@/features/identities/components/IdentityDetail";

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

  const progress = await getIdentityProgress(identity.userId);
  const identityProgress = progress.find((p) => p.identity.id === id);

  return (
    <div className="max-w-2xl">
      <IdentityDetail
        identity={identity}
        strength={identityProgress?.strength ?? 0}
        trend={identityProgress?.trend ?? "stable"}
      />
    </div>
  );
}
