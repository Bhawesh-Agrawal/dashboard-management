import { notFound } from "next/navigation";
import { DsaShell } from "@/features/dsa/components/dsa-shell";
import { ProblemDetailView } from "@/features/dsa/components/problem-detail-view";
import { getDsaProblemDetail } from "@/features/dsa/lib/problems";
import { isUnauthorizedError } from "@/lib/auth";

export const revalidate = 0;

export default async function DsaProblemDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;

  let problem;
  try {
    problem = await getDsaProblemDetail(id);
  } catch (err) {
    if (isUnauthorizedError(err)) {
      notFound();
    }
    throw err;
  }

  return (
    <DsaShell
      title={problem.title}
      subtitle={`${problem.topicName}${problem.subtopic ? ` · ${problem.subtopic}` : ""}`}
      backHref="/dsa/problems"
    >
      <ProblemDetailView problem={problem} />
    </DsaShell>
  );
}
