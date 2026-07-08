import { getRoutinesWithStreaks } from "@/features/routines/lib/completions";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { RoutineList } from "@/features/routines/components/routine-list";
import { CreateRoutineDialog } from "@/features/routines/components/routine-form";

export const revalidate = 0;

export default async function RoutinesPage() {
  const routines = await getRoutinesWithStreaks();

  return (
    <div>
      <PageHeader
        title="Routines"
        subtitle={`${routines.length} routine${routines.length !== 1 ? "s" : ""}`}
        action={<CreateRoutineDialog />}
      />

      {routines.length === 0 ? (
        <EmptyState
          title="No routines yet"
          description="Build daily habits by creating your first routine."
          action={<CreateRoutineDialog />}
        />
      ) : (
        <RoutineList routines={routines} />
      )}
    </div>
  );
}
