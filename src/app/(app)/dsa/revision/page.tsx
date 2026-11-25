import { DsaShell } from "@/features/dsa/components/dsa-shell";
import { RevisionQueueView } from "@/features/dsa/components/revision-queue-view";
import { getDsaRevisionQueue } from "@/features/dsa/lib/revision-queries";

export const revalidate = 0;

export default async function DsaRevisionPage() {
  const { todayStr, queue } = await getDsaRevisionQueue();

  return (
    <DsaShell
      title="Revision Queue"
      subtitle={`${queue.overdue.length} overdue · ${queue.dueToday.length} due today · ${queue.next7Days.length} next 7d`}
    >
      <RevisionQueueView todayStr={todayStr} queue={queue} />
    </DsaShell>
  );
}
