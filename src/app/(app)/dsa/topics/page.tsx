import { DsaShell } from "@/features/dsa/components/dsa-shell";
import { TopicsView } from "@/features/dsa/components/topics-view";
import { getDsaTopicsOverview } from "@/features/dsa/lib/topics";

export const revalidate = 0;

export default async function DsaTopicsPage() {
  const overview = await getDsaTopicsOverview();

  return (
    <DsaShell title="Topics" subtitle="DSA Coverage & Readiness">
      <TopicsView
        initialTopics={overview.topics}
        initialSummary={overview.summary}
      />
    </DsaShell>
  );
}
