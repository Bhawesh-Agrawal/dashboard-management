import { PageHeader } from "@/components/shared/page-header";
import { getCurrentUserId } from "@/lib/auth";
import { formatDateOnly } from "@/lib/timezone";
import { getLatestDailyBriefs } from "@/features/briefs/lib/storage";
import type { BriefPayload } from "@/features/briefs/lib/build";
import { BriefView, type StoredBriefItem } from "@/features/briefs/components/brief-view";

export const revalidate = 0;

export default async function BriefPage() {
  const userId = await getCurrentUserId();
  const { morning, evening } = await getLatestDailyBriefs(userId);

  const toStored = (row: typeof morning): StoredBriefItem | null => {
    if (!row) return null;
    return {
      kind: row.kind,
      forDate: formatDateOnly(row.forDate),
      generatedAt: row.generatedAt.toISOString(),
      payload: row.payload as unknown as BriefPayload,
    };
  };

  return (
    <div>
      <PageHeader
        title="Daily Brief"
        subtitle="Deterministic morning and evening summary"
        backHref="/today"
      />
      <BriefView
        initialMorning={toStored(morning)}
        initialEvening={toStored(evening)}
      />
    </div>
  );
}
