"use client";

import { Link } from "next-view-transitions";
import { computeProjectProgress } from "@/features/projects/lib/utils";
import { EditProjectDialog } from "./edit-project-dialog";

type ProjectWithDomain = {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  status: string;
  createdAt: Date;
  domain: { id: string; name: string; color: string | null } | null;
  _count: { milestones: number; tasks: number };
  milestones: { isDone: boolean; weight: number }[];
};

export function ProjectList({ projects }: { projects: ProjectWithDomain[] }) {
  const active = projects.filter((p) => p.status === "active");
  const completed = projects.filter((p) => p.status === "completed");

  return (
    <div className="space-y-6">
      {active.length > 0 && (
        <div>
          <p className="section-label mb-2">Active · {active.length}</p>
          <div className="space-y-0.5">
            {active.map((project) => (
              <ProjectRow key={project.id} project={project} />
            ))}
          </div>
        </div>
      )}

      {completed.length > 0 && (
        <div>
          <p className="section-label mb-2">Completed · {completed.length}</p>
          <div className="space-y-0.5">
            {completed.map((project) => (
              <ProjectRow key={project.id} project={project} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ProjectRow({ project }: { project: ProjectWithDomain }) {
  const progress = computeProjectProgress(project.milestones);

  return (
    <div className="list-row items-center group">
      <Link
        href={`/projects/${project.id}`}
        className="flex-1 min-w-0"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{project.name}</span>
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          {project.domain && (
            <span className="text-xs text-muted-foreground">
              {project.domain.name}
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            {project._count.tasks} tasks
          </span>
          {project._count.milestones > 0 && (
            <span className="text-xs text-muted-foreground">
              {progress}% milestones
            </span>
          )}
        </div>
      </Link>

      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
        <EditProjectDialog project={project} />
      </div>
    </div>
  );
}
