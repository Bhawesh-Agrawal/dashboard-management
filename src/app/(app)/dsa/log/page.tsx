import { DsaShell } from "@/features/dsa/components/dsa-shell";
import { EmptyState } from "@/components/shared/empty-state";

export const revalidate = 0;

export default function DsaLogPage() {
  return (
    <DsaShell title="Daily Log" subtitle="Study Sessions">
      <EmptyState title="Daily Sessions" description="Sessions and logged attempts will appear here." />
    </DsaShell>
  );
}
