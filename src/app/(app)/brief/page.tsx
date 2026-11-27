import { PageHeader } from "@/components/shared/page-header";
import { getCurrentUserId } from "@/lib/auth";
import { formatDateOnly } from "@/lib/timezone";
import { getLatestDailyBriefs } from "@/features/briefs/lib/storage";
import { getBriefUserConfig } from "@/features/briefs/lib/settings";
import { parseStoredBriefPayload } from "@/features/briefs/lib/payload-v2";
import { BriefView, type StoredBriefItem } from "@/features/briefs/components/brief-view";

export const revalidate = 0;

export default async function BriefPage() {
  const userId = await getCurrentUserId();
  const [{ morning, midday, evening }, config] = await Promise.all([
    getLatestDailyBriefs(userId),
    getBriefUserConfig(userId),
  ]);

  const toStored = (row: typeof morning): StoredBriefItem | null => {
    if (!row) return null;
    const parsed = parseStoredBriefPayload(row.payload);
    if (!parsed) return null;
    return {
      kind: row.kind,
      forDate: formatDateOnly(row.forDate),
      generatedAt: row.generatedAt.toISOString(),
      payload: parsed,
    };
  };

  return (
    <div>
      <PageHeader
        title="Daily Brief"
        subtitle="Personalized morning, midday, and evening brief"
        backHref="/today"
      />
      <BriefView
        initialMorning={toStored(morning)}
        initialMidday={toStored(midday)}
        initialEvening={toStored(evening)}
        cardOrder={config.cardOrder}
        enabledCards={config.enabledCards}
        middayEnabled={config.middayEnabled}
      />
    </div>
  );
}
