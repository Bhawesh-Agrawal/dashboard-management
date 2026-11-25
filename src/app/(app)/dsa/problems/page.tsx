import { DsaShell } from "@/features/dsa/components/dsa-shell";
import { EmptyState } from "@/components/shared/empty-state";

export const revalidate = 0;

export default function DsaProblemsPage() {
  return (
    <DsaShell title="Problems" subtitle="Question Bank">
      <EmptyState title="Problem Bank" description="Problems will appear after importing a question bank." />
    </DsaShell>
  );
}
