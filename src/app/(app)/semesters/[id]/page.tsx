import { getSemesterById } from "@/features/semesters/lib/queries";
export const revalidate = 0;
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { CreateCourseDialog } from "@/features/courses/components/course-form";
import Link from "next/link";
import { setActiveSemester } from "@/features/semesters/lib/actions";
import { computeCourseGrade } from "@/features/assessments/lib/queries";
import { computeSGPA } from "@/features/assessments/lib/calculations";
import { EditSemesterDialog } from "@/features/semesters/components/edit-semester-dialog";
import { FileManager } from "@/features/files/components/FileManager";

export default async function SemesterDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const semester = await getSemesterById(id);

  if (!semester) notFound();

  // Compute grade point for each course
  const courseGrades = await Promise.all(
    semester.courses.map((course) => computeCourseGrade(course))
  );

  const sgpa = computeSGPA(courseGrades);

  return (
    <div>
      <PageHeader
        title={semester.name}
        subtitle={`${new Date(semester.startDate).toLocaleDateString("en-US", { month: "long", year: "numeric" })} — ${new Date(semester.endDate).toLocaleDateString("en-US", { month: "long", year: "numeric" })}${sgpa !== null ? ` · SGPA ${sgpa.toFixed(2)}` : ""}`}
        backHref="/semesters"
        action={
          <div className="flex gap-2">
            <EditSemesterDialog
              semester={{
                id: semester.id,
                name: semester.name,
                startDate: semester.startDate,
                endDate: semester.endDate,
                gradingScale: semester.gradingScale,
              }}
            />
            {!semester.isActive && (
              <form action={setActiveSemester.bind(null, semester.id)}>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent transition-colors"
                >
                  Set as Active
                </button>
              </form>
            )}
            <CreateCourseDialog semesterId={semester.id} />
          </div>
        }
      />

      {semester.courses.length === 0 ? (
        <EmptyState
          title="No courses yet"
          description="Add your first course to this semester."
          action={<CreateCourseDialog semesterId={semester.id} />}
        />
      ) : (
        <div className="space-y-1">
          {semester.courses.map((course, i) => {
            const gp = courseGrades[i].gradePoint;
            return (
              <Link
                key={course.id}
                href={`/courses/${course.id}`}
                className="list-row items-center group"
              >
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground truncate">
                        {course.name}
                      </span>
                      {course.code && (
                        <span className="text-xs text-muted-foreground">{course.code}</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {course.credits} credits{course.instructor ? ` · ${course.instructor}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{course._count.tasks} task{course._count.tasks !== 1 ? "s" : ""} · {course._count.notes} note{course._count.notes !== 1 ? "s" : ""}</span>
                  <span className="font-medium text-foreground w-8 text-right">
                    {gp !== null ? gp.toFixed(1) : "—"}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Semester Files */}
      <div className="mt-10">
        <FileManager
          semesterId={semester.id}
          semesterName={semester.name}
        />
      </div>
    </div>
  );
}
