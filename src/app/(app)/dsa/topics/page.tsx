import { DsaShell } from "@/features/dsa/components/dsa-shell";
import { EmptyState } from "@/components/shared/empty-state";

export const revalidate = 0;

export default function DsaTopicsPage() {
  return (
    <DsaShell title="Topics" subtitle="DSA Coverage & Readiness">
      <EmptyState title="Topics Tracker" description="Topics will appear after importing a question bank." />
    </DsaShell>
  );
}
