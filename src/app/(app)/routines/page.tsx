import { getRoutinesWithStreaks } from "@/features/routines/lib/completions";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { RoutineList } from "@/features/routines/components/routine-list";
import { CreateRoutineDialog } from "@/features/routines/components/routine-form";
import { IdentityGrid } from "@/features/identities/components/IdentityGrid";
import { IdentityForm } from "@/features/identities/components/IdentityForm";
import { getIdentities } from "@/features/identities/lib/actions";

export const revalidate = 0;

const USER_ID = "default-user";

export default async function RoutinesPage() {
  const [routines, identities] = await Promise.all([
    getRoutinesWithStreaks(),
    getIdentities(USER_ID),
  ]);

  return (
    <div>
      <PageHeader
        title="Routines"
        subtitle={`${routines.length} routine${routines.length !== 1 ? "s" : ""}`}
        action={<CreateRoutineDialog identities={identities} />}
      />

      {/* Identities section */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <p className="section-label">IDENTITIES</p>
          <IdentityForm userId={USER_ID} />
        </div>
        <IdentityGrid userId={USER_ID} />
      </div>

      {/* Routines section */}
      {routines.length === 0 ? (
        <EmptyState
          title="No routines yet"
          description="Build daily habits by creating your first routine."
          action={<CreateRoutineDialog identities={identities} />}
        />
      ) : (
        <RoutineList routines={routines} identities={identities} />
      )}
    </div>
  );
}
