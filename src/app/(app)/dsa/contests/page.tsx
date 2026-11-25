import { DsaShell } from "@/features/dsa/components/dsa-shell";
import { EmptyState } from "@/components/shared/empty-state";

export const revalidate = 0;

export default function DsaContestsPage() {
  return (
    <DsaShell title="Contests" subtitle="Contest Log">
      <EmptyState title="Contests" description="Record LeetCode, CodeChef, and other contest logs." />
    </DsaShell>
  );
}
