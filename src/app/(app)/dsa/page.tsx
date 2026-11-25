import { DsaShell } from "@/features/dsa/components/dsa-shell";
import { DsaDashboardView } from "@/features/dsa/components/dsa-dashboard-view";
import { getDsaDashboardData } from "@/features/dsa/lib/dashboard";
import { getDsaWeeklyTopicTrend } from "@/features/dsa/lib/analytics";

export const revalidate = 0;

export default async function DsaDashboardPage() {
  const [data, weeklyTrend] = await Promise.all([
    getDsaDashboardData(),
    getDsaWeeklyTopicTrend(),
  ]);

  return (
    <DsaShell
      title="DSA Tracker"
      subtitle={`Day ${data.programmeDay} of ${data.programmeLengthDays}${
        data.currentPhase ? ` · ${data.currentPhase}` : ""
      }`}
    >
      <DsaDashboardView data={data} weeklyTrend={weeklyTrend} />
    </DsaShell>
  );
}
