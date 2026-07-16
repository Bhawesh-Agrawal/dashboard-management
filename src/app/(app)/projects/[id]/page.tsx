import { notFound } from "next/navigation";
export const revalidate = 0;
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { getProjectById } from "@/features/projects/lib/queries";
import { computeProjectProgress } from "@/features/projects/lib/utils";
import { MilestoneList } from "@/features/projects/components/milestone-list";
import { MilestoneForm } from "@/features/projects/components/milestone-form";
import { EditProjectDialog } from "@/features/projects/components/edit-project-dialog";
import { TaskList } from "@/features/tasks/components/task-list";
import { CreateTaskDialog } from "@/features/tasks/components/task-form";
import { LinkedNotesSection } from "@/components/shared/linked-notes-section";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [project, courses] = await Promise.all([
    getProjectById(id),
    prisma.course.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, color: true },
    }),
  ]);

  if (!project) notFound();

  const progress = computeProjectProgress(project.milestones);

  return (
    <div>
      <PageHeader
        title={project.name}
        subtitle={
          project.domain
            ? `${project.domain.name} · ${project.status}`
            : project.status
        }
        action={<EditProjectDialog project={project} />}
      />

      {project.description && (
        <p className="text-sm text-muted-foreground mb-8">{project.description}</p>
      )}

      <div className="space-y-10">
        {/* Milestones */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="section-label">
              Milestones · {progress}%
            </h2>
          </div>
          {project.milestones.length > 0 && (
            <div className="mb-4 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
          <MilestoneList milestones={project.milestones} projectId={project.id} />
          <div className="mt-4">
            <MilestoneForm projectId={project.id} />
          </div>
        </section>

        {/* Tasks */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="section-label">
              Tasks · {project.tasks.length}
            </h2>
            <CreateTaskDialog projectId={project.id} courses={courses} />
          </div>
          {project.tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No tasks linked to this project yet.
            </p>
          ) : (
            <TaskList tasks={project.tasks} courses={courses} />
          )}
        </section>

        {/* Attachments */}
        <section>
          <LinkedNotesSection projectId={project.id} />
        </section>
      </div>
    </div>
  );
}
