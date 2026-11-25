import { DsaShell } from "@/features/dsa/components/dsa-shell";
import { DsaImportCard } from "@/features/dsa/components/dsa-import-card";

export const revalidate = 0;

export default function DsaSettingsPage() {
  return (
    <DsaShell title="DSA Settings" subtitle="Programme, Import & Backup">
      <div className="space-y-6">
        <DsaImportCard />
      </div>
    </DsaShell>
  );
}
