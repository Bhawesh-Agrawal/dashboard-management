"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

type ProjectOption = { id: string; name: string; color: string | null };
type CourseOption = { id: string; name: string; color: string | null };

const STATUS_TABS = [
  { label: "OPEN", value: "open" },
  { label: "DONE", value: "done" },
  { label: "ALL", value: "all" },
] as const;

export function TaskFilters({
  projects,
  courses,
  showEnded = false,
}: {
  projects: ProjectOption[];
  courses: CourseOption[];
  showEnded?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const activeStatus = searchParams.get("status") || "open";
  const activeProject = searchParams.get("project") || "";
  const activeCourse = searchParams.get("course") || "";

  function setFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.push(`/tasks?${params.toString()}`);
  }

  function toggleShowEnded() {
    const params = new URLSearchParams(searchParams.toString());
    if (showEnded) {
      params.delete("showEnded");
    } else {
      params.set("showEnded", "true");
    }
    router.push(`/tasks?${params.toString()}`);
  }

  return (
    <div className="space-y-3 mb-6">
      {/* Status tabs */}
      <div className="flex items-center gap-2">
        <span className="section-label">STATUS</span>
        <div className="flex gap-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setFilter("status", tab.value === "open" ? "" : tab.value)}
              className={cn(
                "px-3 py-1 text-xs rounded transition-colors",
                activeStatus === tab.value
                  ? "bg-foreground text-background font-medium"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Project filter chips */}
      {projects.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-1 scrollbar-none scroll-fade-right">
          <span className="section-label shrink-0">PROJECT</span>
          <button
            onClick={() => setFilter("project", "")}
            className={cn(
              "px-2 py-0.5 text-xs rounded transition-colors shrink-0",
              !activeProject
                ? "bg-foreground text-background font-medium"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            ALL
          </button>
          <button
            onClick={() => setFilter("project", "none")}
            className={cn(
              "px-2 py-0.5 text-xs rounded transition-colors shrink-0",
              activeProject === "none"
                ? "bg-foreground text-background font-medium"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            NO PROJECT
          </button>
          {projects.map((p) => (
            <button
              key={p.id}
              onClick={() => setFilter("project", p.id)}
              className={cn(
                "px-2 py-0.5 text-xs rounded transition-colors flex items-center gap-1 shrink-0",
                activeProject === p.id
                  ? "bg-foreground text-background font-medium"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}

      {/* Course filter chips */}
      <div className="flex items-center gap-2 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-1 scrollbar-none scroll-fade-right">
        <span className="section-label shrink-0">COURSE</span>
        <button
          onClick={() => setFilter("course", "")}
          className={cn(
            "px-2 py-0.5 text-xs rounded transition-colors shrink-0",
            !activeCourse
              ? "bg-foreground text-background font-medium"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          ALL
        </button>
        {courses.map((c) => (
          <button
            key={c.id}
            onClick={() => setFilter("course", c.id)}
            className={cn(
              "px-2 py-0.5 text-xs rounded transition-colors flex items-center gap-1 shrink-0",
              activeCourse === c.id
                ? "bg-foreground text-background font-medium"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {c.name}
          </button>
        ))}
        <button
          onClick={toggleShowEnded}
          className="px-2 py-0.5 text-xs rounded transition-colors text-muted-foreground hover:text-foreground shrink-0"
        >
          {showEnded ? "Hide ended" : "Show ended"}
        </button>
      </div>
    </div>
  );
}
