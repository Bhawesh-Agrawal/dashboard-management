import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { getAllProjects } from "@/features/projects/lib/queries";
import { getDomains } from "@/features/domains/lib/queries";
import { ProjectList } from "@/features/projects/components/project-list";
import { CreateProjectDialog } from "@/features/projects/components/project-form";

export default async function ProjectsPage() {
  const [projects, domains] = await Promise.all([getAllProjects(), getDomains()]);

  return (
    <div>
      <PageHeader
        title="Projects"
        subtitle={`${projects.length} project${projects.length !== 1 ? "s" : ""}`}
        action={<CreateProjectDialog domains={domains} />}
      />
      {projects.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description="Create your first non-academic project to start tracking milestones and tasks."
          action={<CreateProjectDialog domains={domains} />}
        />
      ) : (
        <ProjectList projects={projects} />
      )}
    </div>
  );
}
