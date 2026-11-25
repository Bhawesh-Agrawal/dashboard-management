import { DsaShell } from "@/features/dsa/components/dsa-shell";
import { EmptyState } from "@/components/shared/empty-state";

export const revalidate = 0;

export default function DsaDashboardPage() {
  return (
    <DsaShell title="DSA Tracker" subtitle="90-Day Preparation Log">
      <EmptyState
        title="DSA Tracker initialized"
        description="Configure your programme start date and import your question bank in Settings."
      />
    </DsaShell>
  );
}
