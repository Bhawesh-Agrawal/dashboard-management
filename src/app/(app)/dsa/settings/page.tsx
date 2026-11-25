import { DsaShell } from "@/features/dsa/components/dsa-shell";
import { EmptyState } from "@/components/shared/empty-state";

export const revalidate = 0;

export default function DsaSettingsPage() {
  return (
    <DsaShell title="DSA Settings" subtitle="Programme, Import & Backup">
      <EmptyState title="Programme Settings" description="Configure start date, phases, import, and backups." />
    </DsaShell>
  );
}
