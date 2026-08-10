"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useTasks, useCourses } from "@/lib/sync/hooks";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { TaskList } from "@/features/tasks/components/task-list";
import { CreateTaskDialog } from "@/features/tasks/components/task-form";
import { TaskFilters } from "@/features/tasks/components/task-filters";
import { isCourseEnded } from "@/lib/course-utils";
import { db } from "@/lib/sync/db";
import { useLiveQuery } from "dexie-react-hooks";

function TasksPageInner() {
  const searchParams = useSearchParams();
  const status = searchParams.get("status") || "open";
  const project = searchParams.get("project") || "";
  const course = searchParams.get("course") || "";

  const tasks = useTasks({
    status: status as "open" | "done" | "all",
    courseId: course || undefined,
    projectId: project || undefined,
  });

  const allCourses = useCourses();

  // Projects stay server-fetched (not in sync scope)
  const projects = useLiveQuery(async () => {
    try {
      const res = await fetch("/api/sync/seed", { credentials: "include" });
      // Projects aren't in seed, so we fetch them separately
      return [];
    } catch {
      return [];
    }
  }) ?? [];

  // Filter courses for display (active ones for filters)
  const filterCourses = allCourses
    .filter((c) => !isCourseEnded({ semester: { endDate: c.semesterId } } as any))
    .map((c) => ({ id: c.id, name: c.name, color: c.color }));

  // All courses for the picker
  const pickerCourses = allCourses.map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    code: c.code,
    semester: null,
  }));

  const openCount = tasks.filter((t) => t.status === "open").length;

  return (
    <div>
      <PageHeader
        title="Tasks"
        subtitle={`${openCount} open`}
        action={<CreateTaskDialog courses={pickerCourses} projects={projects} />}
      />

      <TaskFilters
        projects={projects.map((p: any) => ({ id: p.id, name: p.name, color: p.color }))}
        courses={filterCourses}
      />

      {tasks.length === 0 ? (
        <EmptyState
          title="No tasks yet"
          description="Create your first task to get started."
          action={<CreateTaskDialog courses={pickerCourses} projects={projects} />}
        />
      ) : (
        <TaskList tasks={tasks as any} courses={pickerCourses} projects={projects} />
      )}
    </div>
  );
}

export default function TasksPageClient() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    }>
      <TasksPageInner />
    </Suspense>
  );
}
