import { DsaShell } from "@/features/dsa/components/dsa-shell";
import { SessionsView } from "@/features/dsa/components/sessions-view";
import { getDsaSessionsPageData } from "@/features/dsa/lib/sessions";

export const revalidate = 0;

export default async function DsaLogPage() {
  const data = await getDsaSessionsPageData();

  return (
    <DsaShell title="Daily Log" subtitle="Study Sessions">
      <SessionsView
        todayStr={data.todayStr}
        sessions={data.sessions}
        problemOptions={data.problemOptions}
      />
    </DsaShell>
  );
}
