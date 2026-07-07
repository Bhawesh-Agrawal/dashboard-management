import { getSemesters } from "@/features/semesters/lib/queries";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import Link from "next/link";
import { CreateSemesterDialog } from "@/features/semesters/components/semester-form";
import { computeCourseGrade } from "@/features/assessments/lib/queries";
import { computeSGPA, computeCGPA } from "@/features/assessments/lib/calculations";

export default async function SemestersPage() {
  const semesters = await getSemesters();

  // Compute SGPA per semester and cumulative CGPA
  const semesterData = await Promise.all(
    semesters.map(async (sem) => {
      const grades = await Promise.all(
        sem.courses.map((course) => computeCourseGrade(course))
      );
      const sgpa = computeSGPA(grades);
      const totalCredits = sem.courses.reduce((sum, c) => sum + c.credits, 0);
      return { sgpa, totalCredits };
    })
  );

  const cgpa = computeCGPA(semesterData);

  return (
    <div>
      <PageHeader
        title="Semesters"
        subtitle={cgpa !== null ? `CGPA ${cgpa.toFixed(2)} · ${semesters.length} semester${semesters.length !== 1 ? "s" : ""}` : `${semesters.length} semester${semesters.length !== 1 ? "s" : ""}`}
        action={<CreateSemesterDialog />}
      />

      {semesters.length === 0 ? (
        <EmptyState
          title="No semesters yet"
          description="Create your first semester to start tracking courses and grades."
          action={<CreateSemesterDialog />}
        />
      ) : (
        <div className="space-y-1">
          {semesters.map((semester, i) => {
            const totalCredits = semester.courses.reduce((sum, c) => sum + c.credits, 0);
            const { sgpa } = semesterData[i];
            return (
              <Link
                key={semester.id}
                href={`/semesters/${semester.id}`}
                className="list-row items-center group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground truncate">
                      {semester.name}
                    </span>
                    {semester.isActive && (
                      <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[0.6rem] font-medium text-primary">
                        ACTIVE
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {totalCredits} credits · {semester.courses.length} course{semester.courses.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>
                    {new Date(semester.startDate).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                    {" — "}
                    {new Date(semester.endDate).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                  </span>
                  <span className="font-medium text-foreground w-8 text-right">
                    {sgpa !== null ? sgpa.toFixed(2) : "—"}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
