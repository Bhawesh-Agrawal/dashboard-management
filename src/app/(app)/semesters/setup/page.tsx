import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { getSemesters, getSemesterById } from "@/features/semesters/lib/queries";
import { listAcademicCalendarEntries } from "@/features/semesters/lib/calendar-actions";
import { SemesterSetupWizard } from "@/features/semesters/components/semester-setup-wizard";

export const revalidate = 0;

export default async function SemesterSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ semesterId?: string }>;
}) {
  const { semesterId } = await searchParams;
  const allSemesters = await getSemesters().catch(() => []);
  const existing = semesterId ? await getSemesterById(semesterId).catch(() => null) : null;
  const [entries, scheduleCount] = existing
    ? await Promise.all([
        listAcademicCalendarEntries(existing.id).catch(() => []),
        prisma.classSchedule
          .count({ where: { course: { semesterId: existing.id } } })
          .catch(() => 0),
      ])
    : [[], 0];

  return (
    <div>
      <PageHeader
        title="Semester Setup Wizard"
        subtitle="Prepare dates, academic calendar, courses, and timetable"
        backHref="/semesters"
      />
      <SemesterSetupWizard
        previousSemesters={allSemesters
          .filter((s) => s.id !== existing?.id)
          .map((s) => ({
            id: s.id,
            name: s.name,
            courseCount: s.courses.length,
          }))}
        initialSemester={
          existing
            ? {
                id: existing.id,
                name: existing.name,
                startDate: existing.startDate.toISOString().slice(0, 10),
                endDate: existing.endDate.toISOString().slice(0, 10),
                gradingScale: existing.gradingScale,
              }
            : null
        }
        initialCourses={
          existing?.courses.map((c) => ({
            id: c.id,
            name: c.name,
            code: c.code,
            credits: c.credits,
            instructor: c.instructor,
          })) ?? []
        }
        initialCalendarEntries={entries.map((e) => ({
          id: e.id,
          kind: e.kind,
          title: e.title,
          startDate: e.startDate.toISOString().slice(0, 10),
          endDate: e.endDate.toISOString().slice(0, 10),
          cancelsClasses: e.cancelsClasses,
          followsWeekday: e.followsWeekday,
          notes: e.notes,
        }))}
        initialScheduleCount={scheduleCount}
      />
    </div>
  );
}
