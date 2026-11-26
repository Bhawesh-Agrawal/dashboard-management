import { prisma } from "@/lib/prisma";
import { getNow } from "@/lib/clock";
import { requireDsaUserId } from "@/features/dsa/lib/ownership";
import { getUserTimezone } from "@/lib/timezone-server";
import { dsaDateStr, dsaToday } from "@/features/dsa/lib/time";
import { DsaShell } from "@/features/dsa/components/dsa-shell";
import { DsaProgrammeSettingsCard } from "@/features/dsa/components/dsa-programme-settings-card";
import { DsaImportCard } from "@/features/dsa/components/dsa-import-card";
import { DsaBackupCard } from "@/features/dsa/components/dsa-backup-card";
import type { DsaPhase } from "@/features/dsa/lib/schemas";

export const revalidate = 0;

export default async function DsaSettingsPage() {
  const userId = await requireDsaUserId();
  const [settings, tz] = await Promise.all([
    prisma.dsaSettings.findUnique({ where: { userId } }),
    getUserTimezone(),
  ]);
  const todayStr = dsaToday(getNow(), tz);

  const phases = Array.isArray(settings?.phases)
    ? (settings.phases as unknown as DsaPhase[])
    : [];

  return (
    <DsaShell title="DSA Settings" subtitle="Programme, Import & Backup">
      <div className="space-y-6">
        <DsaProgrammeSettingsCard
          initialStartDate={
            settings ? dsaDateStr(settings.programmeStartDate) : todayStr
          }
          initialLengthDays={settings?.programmeLengthDays ?? 90}
          initialPhases={phases}
          currentTopicId={settings?.currentTopicId ?? null}
        />
        <DsaImportCard />
        <DsaBackupCard
          lastBackupAt={settings?.lastBackupAt ? settings.lastBackupAt.toISOString() : null}
        />
      </div>
    </DsaShell>
  );
}
