import { DsaShell } from "@/features/dsa/components/dsa-shell";
import { ProblemsView } from "@/features/dsa/components/problems-view";
import { getDsaProblemsPageData } from "@/features/dsa/lib/problems";

export const revalidate = 0;

export default async function DsaProblemsPage(props: {
  searchParams: Promise<{ topicId?: string }>;
}) {
  const searchParams = await props.searchParams;
  const data = await getDsaProblemsPageData();
  const validTopicIds = new Set(data.topics.map((t) => t.id));
  const defaultTopicId =
    searchParams.topicId && validTopicIds.has(searchParams.topicId)
      ? searchParams.topicId
      : data.currentTopicId ?? "all";

  return (
    <DsaShell title="Problems" subtitle="Question Bank">
      <ProblemsView
        problems={data.problems}
        topics={data.topics}
        defaultTopicId={defaultTopicId}
        todayStr={data.todayStr}
      />
    </DsaShell>
  );
}
