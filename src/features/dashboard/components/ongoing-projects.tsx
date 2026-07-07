import Link from "next/link";
import type { DashboardData } from "@/types";

export function OngoingProjects({
  projects,
}: {
  projects: DashboardData["activeProjects"];
}) {
  if (projects.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="section-label">ONGOING PROJECTS</p>
        <Link
          href="/projects"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          View all
        </Link>
      </div>
      <div className="space-y-2">
        {projects.map((project) => (
          <Link
            key={project.id}
            href={`/projects/${project.id}`}
            className="flex items-center gap-3 p-2 rounded-md hover:bg-accent/50 transition-colors -mx-2"
          >
            <span className="text-sm flex-1">{project.name}</span>
            <span className="text-xs text-muted-foreground font-medium">
              {project.progress}%
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
