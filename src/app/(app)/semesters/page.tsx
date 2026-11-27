import { getSemesters } from "@/features/semesters/lib/queries";
import { semesterStatus, type SemesterLifecycleStatus } from "@/features/semesters/lib/status";
import { getNow } from "@/lib/clock";
import { getTodayInTimezone } from "@/lib/timezone";
import { getUserTimezone } from "@/lib/timezone-server";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import Link from "next/link";
import { CreateSemesterDialog } from "@/features/semesters/components/semester-form";
import { computeCourseGrade } from "@/features/assessments/lib/queries";
import { computeSGPA, computeCGPA } from "@/features/assessments/lib/calculations";

export const revalidate = 0;

const STATUS_LABELS: Record<SemesterLifecycleStatus, string> = {
  active: "Active",
  upcoming: "Upcoming",
  ended: "Ended",
};

export default async function SemestersPage() {
  const [semesters, timezone] = await Promise.all([
    getSemesters(),
    getUserTimezone(),
  ]);
  const todayDateOnly = getTodayInTimezone(timezone, getNow());

  // Compute SGPA per semester and cumulative CGPA
  const semesterData = await Promise.all(
    semesters.map(async (sem) => {
      const grades = await Promise.all(
        sem.courses.map((course) => computeCourseGrade(course))
      );
      const sgpa = computeSGPA(grades);
      const totalCredits = sem.courses.reduce((sum, c) => sum + c.credits, 0);
      return {
        sgpa,
        totalCredits,
        status: semesterStatus(sem, todayDateOnly),
      };
    })
  );

  const cgpa = computeCGPA(semesterData);

  const groups: Array<{
    key: SemesterLifecycleStatus;
    label: string;
    items: Array<{ semester: (typeof semesters)[number]; sgpa: number | null; status: SemesterLifecycleStatus }>;
  }> = [
    { key: "active", label: "Current", items: [] },
    { key: "upcoming", label: "Upcoming", items: [] },
    { key: "ended", label: "Past", items: [] },
  ];

  semesters.forEach((semester, i) => {
    const info = semesterData[i];
    const target = groups.find((g) => g.key === info.status);
    target?.items.push({ semester, sgpa: info.sgpa, status: info.status });
  });

  return (
    <div>
      <PageHeader
        title="Semesters"
        subtitle={cgpa !== null ? `CGPA ${cgpa.toFixed(2)} · ${semesters.length} semester${semesters.length !== 1 ? "s" : ""}` : `${semesters.length} semester${semesters.length !== 1 ? "s" : ""}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/semesters/setup"
              className="inline-flex items-center justify-center rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors min-h-[44px]"
            >
              Setup wizard
            </Link>
            <CreateSemesterDialog />
          </div>
        }
      />

      {semesters.length === 0 ? (
        <EmptyState
          title="No semesters yet"
          description="Create your first semester to start tracking courses and grades."
          action={<CreateSemesterDialog />}
        />
      ) : (
        <div className="space-y-8">
          {groups
            .filter((g) => g.items.length > 0)
            .map((group) => (
              <section key={group.key}>
                <h2 className="section-label mb-3">{group.label}</h2>
                <div className="space-y-1">
                  {group.items.map(({ semester, sgpa, status }) => {
                    const totalCredits = semester.courses.reduce((sum, c) => sum + c.credits, 0);
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
                            <span className="inline-flex items-center rounded-md border border-border px-2 py-0.5 text-[0.65rem] font-medium text-muted-foreground">
                              {STATUS_LABELS[status]}
                            </span>
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
              </section>
            ))}
        </div>
      )}
    </div>
  );
}
