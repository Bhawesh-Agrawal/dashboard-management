import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { getSemesterById } from "@/features/semesters/lib/queries";
import { TimetableManager } from "@/features/schedule/components/timetable-manager";

export const revalidate = 0;

export default async function SemesterTimetablePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const semester = await getSemesterById(id);
  if (!semester) notFound();

  const schedules = await prisma.classSchedule.findMany({
    where: { course: { semesterId: id } },
    include: { course: { select: { name: true } } },
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
  });

  return (
    <div>
      <PageHeader
        title={`${semester.name} · Timetable`}
        subtitle="Weekly recurring class schedule"
        backHref={`/semesters/${id}`}
      />
      <TimetableManager
        semesterId={id}
        semesterEndDate={semester.endDate.toISOString().slice(0, 10)}
        courses={semester.courses.map((c) => ({
          id: c.id,
          name: c.name,
          code: c.code,
        }))}
        initialSlots={schedules.map((s) => ({
          id: s.id,
          courseId: s.courseId,
          courseName: s.course.name,
          dayOfWeek: s.dayOfWeek,
          startTime: s.startTime,
          endTime: s.endTime,
          location: s.location,
        }))}
      />
    </div>
  );
}
