import { DsaShell } from "@/features/dsa/components/dsa-shell";
import { ContestsView } from "@/features/dsa/components/contests-view";
import { getDsaContestsPageData } from "@/features/dsa/lib/contests";

export const revalidate = 0;

export default async function DsaContestsPage() {
  const data = await getDsaContestsPageData();

  return (
    <DsaShell title="Contests" subtitle="Manual Contest Log">
      <ContestsView todayStr={data.todayStr} contests={data.contests} />
    </DsaShell>
  );
}
