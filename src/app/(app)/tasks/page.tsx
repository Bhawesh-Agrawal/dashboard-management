import { getTasks } from "@/features/tasks/lib/queries";
import { getAllProjects } from "@/features/projects/lib/queries";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { TaskList } from "@/features/tasks/components/task-list";
import { CreateTaskDialog } from "@/features/tasks/components/task-form";
import { TaskFilters } from "@/features/tasks/components/task-filters";
import { isCourseEnded } from "@/lib/course-utils";

export const revalidate = 0;

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; project?: string; course?: string; showEnded?: string }>;
}) {
  const params = await searchParams;
  const status = params.status || "open";
  const showEnded = params.showEnded === "true";

  const [tasks, projects, allCourses] = await Promise.all([
    getTasks({
      projectId: params.project || undefined,
      courseId: params.course || undefined,
      status: status as "open" | "done" | "all",
    }),
    getAllProjects(),
    prisma.course.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        color: true,
        code: true,
        semester: { select: { endDate: true } },
      },
    }),
  ]);

  // Courses for filters always show active ones
  const filterCourses = allCourses
    .filter((c) => !isCourseEnded(c))
    .map((c) => ({ id: c.id, name: c.name, color: c.color }));

  // Courses for the create dialog (LinkToPicker handles ended filtering internally)
  const pickerCourses = allCourses.map(({ semester, ...rest }) => ({
    ...rest,
    semester,
  }));

  // Projects shaped for the picker
  const pickerProjects = projects.map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    domain: p.domain,
  }));

  return (
    <div>
      <PageHeader
        title="Tasks"
        subtitle={`${tasks.filter((t) => t.status === "open").length} open`}
        action={<CreateTaskDialog courses={pickerCourses} projects={pickerProjects} />}
      />

      <TaskFilters
        projects={projects.map((p) => ({ id: p.id, name: p.name, color: p.color }))}
        courses={filterCourses}
        showEnded={showEnded}
      />

      {tasks.length === 0 ? (
        <EmptyState
          title="No tasks yet"
          description="Create your first task to get started."
          action={<CreateTaskDialog courses={pickerCourses} projects={pickerProjects} />}
        />
      ) : (
        <TaskList tasks={tasks} courses={pickerCourses} projects={pickerProjects} />
      )}
    </div>
  );
}
