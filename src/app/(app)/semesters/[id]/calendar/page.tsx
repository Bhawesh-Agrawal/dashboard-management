import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { getSemesterById } from "@/features/semesters/lib/queries";
import { listAcademicCalendarEntries } from "@/features/semesters/lib/calendar-actions";
import {
  AcademicCalendarManager,
  type CalendarEntryDTO,
} from "@/features/semesters/components/academic-calendar-manager";
import { ConvertRepeatedHolidaysPanel } from "@/features/semesters/components/convert-repeated-holidays-panel";
import { AuditCalendarEntriesPanel } from "@/features/semesters/components/audit-calendar-entries-panel";

export const revalidate = 0;

export default async function SemesterCalendarPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const semester = await getSemesterById(id);
  if (!semester) notFound();

  const rawEntries = await listAcademicCalendarEntries(id).catch(() => []);
  const initialEntries: CalendarEntryDTO[] = rawEntries.map((e) => ({
    id: e.id,
    kind: e.kind,
    title: e.title,
    startDate: e.startDate.toISOString().slice(0, 10),
    endDate: e.endDate.toISOString().slice(0, 10),
    cancelsClasses: e.cancelsClasses,
    followsWeekday: e.followsWeekday,
    notes: e.notes,
  }));

  return (
    <div>
      <PageHeader
        title={`${semester.name} · Academic Calendar`}
        subtitle="Holidays, breaks, exam periods, and day-order swaps"
        backHref={`/semesters/${id}`}
      />
      <AcademicCalendarManager
        semesterId={id}
        defaultYear={semester.startDate.getUTCFullYear()}
        semesterStartDate={semester.startDate.toISOString().slice(0, 10)}
        semesterEndDate={semester.endDate.toISOString().slice(0, 10)}
        initialEntries={initialEntries}
      />
      <ConvertRepeatedHolidaysPanel semesterId={id} />
      <AuditCalendarEntriesPanel
        semesterEndDate={semester.endDate.toISOString().slice(0, 10)}
        entries={initialEntries}
      />
    </div>
  );
}
