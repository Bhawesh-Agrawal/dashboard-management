import type { TaskWithCourse } from "@/types";

/**
 * Shared breadcrumb-style badge showing a task's hierarchy:
 * - Academic task: "ACADEMICS › CS301" with color dot
 * - Project task: "PERSONAL › Project Name"
 * - Unlinked task: muted "Unsorted" label
 *
 * Used identically on /tasks, dashboard All Open Tasks, and task detail.
 */
export function TaskLinkBadge({ task }: { task: TaskWithCourse }) {
  if (task.course) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground min-w-0 max-w-[200px] sm:max-w-none">
        <span className="shrink-0 text-[0.6rem] uppercase tracking-widest font-medium text-muted-foreground/70">
          Academics
        </span>
        <span className="text-muted-foreground/40 shrink-0">›</span>
        <span className="truncate">{task.course.name}</span>
      </span>
    );
  }

  if (task.project) {
    const domainName = "Personal";
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground min-w-0 max-w-[200px] sm:max-w-none">
        <span className="shrink-0 text-[0.6rem] uppercase tracking-widest font-medium text-muted-foreground/70">
          {domainName}
        </span>
        <span className="text-muted-foreground/40 shrink-0">›</span>
        <span className="truncate">{task.project.name}</span>
      </span>
    );
  }

  return (
    <span className="text-xs text-muted-foreground/50 italic">
      Unsorted
    </span>
  );
}
