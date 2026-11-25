import { DsaShell } from "@/features/dsa/components/dsa-shell";
import { EmptyState } from "@/components/shared/empty-state";

export const revalidate = 0;

export default function DsaReportPage() {
  return (
    <DsaShell title="Tutor Report" subtitle="Export for External Review">
      <EmptyState title="Tutor Report" description="Generate Markdown or JSON progress snapshots here." />
    </DsaShell>
  );
}
