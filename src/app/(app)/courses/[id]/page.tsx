import { getCourseById } from "@/features/courses/lib/queries";
export const revalidate = 0;
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { ScheduleSection } from "@/features/schedule/components/schedule-grid";
import { AttendanceSection } from "@/features/attendance/components/attendance-calendar";
import { AssessmentSection } from "@/features/assessments/components/assessment-table";
import { CourseTasksSection } from "@/features/courses/components/course-tasks";
import { CourseNotesSection } from "@/features/courses/components/course-notes";
import { FileManager } from "@/features/files/components/FileManager";
import { EditCourseDialog } from "@/features/courses/components/edit-course-dialog";
import { AttendanceModeToggle } from "@/features/courses/components/attendance-mode-toggle";
import {
  computeAttendancePercent,
  computeAttendanceMarks,
  getAttendanceMarksConfig,
} from "@/features/assessments/lib/calculations";
import type { AttendanceStatus } from "@prisma/client";

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const course = await getCourseById(id);

  if (!course) notFound();

  // Compute attendance marks based on mode (auto or manual)
  let attendancePercent: number;
  if (
    course.attendanceMode === "manual" &&
    course.manualPresent != null &&
    course.manualTotalClasses != null &&
    course.manualTotalClasses > 0
  ) {
    // Manual mode: use user-provided present/total classes
    const absent = course.manualTotalClasses - course.manualPresent;
    attendancePercent = computeAttendancePercent(course.manualPresent, absent);
  } else {
    // Auto mode: compute from AttendanceRecord rows
    const present = course.attendanceRecords.filter(
      (r: { status: AttendanceStatus }) => r.status === "present"
    ).length;
    const absent = course.attendanceRecords.filter(
      (r: { status: AttendanceStatus }) => r.status === "absent"
    ).length;
    attendancePercent = computeAttendancePercent(present, absent);
  }

  const attConfig = await getAttendanceMarksConfig(
    course.id,
    course.semesterId
  );
  const attendanceMarks = computeAttendanceMarks(
    attendancePercent,
    attConfig.map((c) => ({ minPercent: c.minPercent, marks: c.marks }))
  );

  return (
    <div>
      <PageHeader
        title={course.name}
        subtitle={`${course.code ? course.code + " · " : ""}${course.credits} credits${course.instructor ? ` · ${course.instructor}` : ""}`}
        action={
          <EditCourseDialog
            course={{
              id: course.id,
              name: course.name,
              code: course.code,
              credits: course.credits,
              instructor: course.instructor,
              color: course.color,
              targetGrade: course.targetGrade,
              semesterId: course.semesterId,
            }}
          />
        }
      />

      <div className="space-y-10">
        <ScheduleSection courseId={course.id} schedules={course.classSchedules} />
        <AttendanceModeToggle
          courseId={course.id}
          mode={course.attendanceMode ?? "auto"}
          manualPresent={course.manualPresent}
          manualTotalClasses={course.manualTotalClasses}
        />
        <AttendanceSection courseId={course.id} records={course.attendanceRecords} />
        <AssessmentSection
          courseId={course.id}
          assessments={course.assessments}
          attendanceMarks={attendanceMarks}
          attendancePercent={attendancePercent}
          attendanceMode={course.attendanceMode ?? "auto"}
          manualPresent={course.manualPresent}
          manualTotalClasses={course.manualTotalClasses}
        />
        <CourseTasksSection courseId={course.id} tasks={course.tasks} />
        <CourseNotesSection courseId={course.id} notes={course.notes} />
        <FileManager
          courseId={course.id}
          courseName={course.name}
        />
      </div>
    </div>
  );
}
