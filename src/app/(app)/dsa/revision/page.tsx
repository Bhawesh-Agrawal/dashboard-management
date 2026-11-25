import { DsaShell } from "@/features/dsa/components/dsa-shell";
import { EmptyState } from "@/components/shared/empty-state";

export const revalidate = 0;

export default function DsaRevisionPage() {
  return (
    <DsaShell title="Revision Queue" subtitle="Scheduled Problem Reviews">
      <EmptyState title="Revision Queue" description="Problems due for revision will appear here." />
    </DsaShell>
  );
}
