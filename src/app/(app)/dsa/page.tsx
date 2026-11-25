import { DsaShell } from "@/features/dsa/components/dsa-shell";
import { DsaDashboardView } from "@/features/dsa/components/dsa-dashboard-view";
import { getDsaDashboardData } from "@/features/dsa/lib/dashboard";

export const revalidate = 0;

export default async function DsaDashboardPage() {
  const data = await getDsaDashboardData();

  return (
    <DsaShell
      title="DSA Tracker"
      subtitle={`Day ${data.programmeDay} of ${data.programmeLengthDays}${
        data.currentPhase ? ` · ${data.currentPhase}` : ""
      }`}
    >
      <DsaDashboardView data={data} />
    </DsaShell>
  );
}
