import { DsaShell } from "@/features/dsa/components/dsa-shell";
import { TutorReportView } from "@/features/dsa/components/report-view";
import { getDsaReportSourceData } from "@/features/dsa/lib/report-queries";

export const revalidate = 0;

export default async function DsaReportPage() {
  const source = await getDsaReportSourceData();

  return (
    <DsaShell title="Tutor Report" subtitle="Export Markdown or JSON Snapshot">
      <TutorReportView source={source} />
    </DsaShell>
  );
}
