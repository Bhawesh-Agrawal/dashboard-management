"use client";

import { useState, useMemo } from "react";
import { Search, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { isCourseEnded } from "@/lib/course-utils";

export type LinkToOption = {
  id: string;
  name: string;
  color: string | null;
  semester?: { endDate: Date | string } | null;
  domain?: { name: string } | null;
};

type LinkToPickerProps = {
  courses: LinkToOption[];
  projects: LinkToOption[];
  selectedCourseId: string;
  selectedProjectId: string;
  onCourseChange: (courseId: string) => void;
  onProjectChange: (projectId: string) => void;
};

export function LinkToPicker({
  courses,
  projects,
  selectedCourseId,
  selectedProjectId,
  onCourseChange,
  onProjectChange,
}: LinkToPickerProps) {
  const [search, setSearch] = useState("");
  const [showEnded, setShowEnded] = useState(false);
  const [academicsOpen, setAcademicsOpen] = useState(false);
  const [personalOpen, setPersonalOpen] = useState(false);

  const activeCourses = useMemo(() => {
    const filtered = showEnded
      ? courses
      : courses.filter((c) => !c.semester || !isCourseEnded(c));
    if (!search) return filtered;
    const q = search.toLowerCase();
    return filtered.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c as Record<string, unknown>)["code"]?.toString().toLowerCase().includes(q)
    );
  }, [courses, showEnded, search]);

  const filteredProjects = useMemo(() => {
    if (!search) return projects;
    const q = search.toLowerCase();
    return projects.filter((p) => p.name.toLowerCase().includes(q));
  }, [projects, search]);

  const selectedLabel = selectedCourseId
    ? courses.find((c) => c.id === selectedCourseId)?.name || "Course"
    : selectedProjectId
      ? projects.find((p) => p.id === selectedProjectId)?.name || "Project"
      : "None";

  function handleSelectCourse(courseId: string) {
    onCourseChange(courseId);
    onProjectChange("");
    setSearch("");
    setAcademicsOpen(false);
  }

  function handleSelectProject(projectId: string) {
    onProjectChange(projectId);
    onCourseChange("");
    setSearch("");
    setPersonalOpen(false);
  }

  function handleClear() {
    onCourseChange("");
    onProjectChange("");
    setSearch("");
  }

  return (
    <div className="space-y-2">
      <label className="section-label">Link to</label>

      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            if (e.target.value) {
              setAcademicsOpen(true);
              setPersonalOpen(true);
            }
          }}
          placeholder="Search courses or projects..."
          className="flex h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm"
        />
      </div>

      {/* Current selection */}
      {(selectedCourseId || selectedProjectId) && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Selected:</span>
          <span className="font-medium">{selectedLabel}</span>
          <button
            type="button"
            onClick={handleClear}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        </div>
      )}

      {/* None option */}
      <button
        type="button"
        onClick={handleClear}
        className={cn(
          "w-full text-left px-2 py-1.5 text-sm rounded transition-colors",
          !selectedCourseId && !selectedProjectId
            ? "bg-foreground text-background font-medium"
            : "text-muted-foreground hover:bg-accent"
        )}
      >
        None (Personal inbox)
      </button>

      {/* Academics section */}
      <div>
        <button
          type="button"
          onClick={() => setAcademicsOpen(!academicsOpen)}
          className="flex items-center gap-1 w-full text-left px-2 py-1.5 text-sm font-medium hover:bg-accent rounded transition-colors"
        >
          {academicsOpen ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
          Academics
        </button>
        {academicsOpen && (
          <div className="ml-4 space-y-0.5">
            {activeCourses.length === 0 ? (
              <p className="text-xs text-muted-foreground px-2 py-1">
                No courses available
              </p>
            ) : (
              activeCourses.map((course) => (
                <button
                  key={course.id}
                  type="button"
                  onClick={() => handleSelectCourse(course.id)}
                  className={cn(
                    "w-full text-left px-2 py-1.5 text-sm rounded flex items-center gap-2 transition-colors",
                    selectedCourseId === course.id
                      ? "bg-foreground text-background font-medium"
                      : "hover:bg-accent"
                  )}
                >
                  <span className="truncate">{course.name}</span>
                </button>
              ))
            )}
            {/* Show ended toggle */}
            {courses.some((c) => c.semester && isCourseEnded(c)) && (
              <label className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={showEnded}
                  onChange={(e) => setShowEnded(e.target.checked)}
                  className="h-3 w-3 rounded border-border"
                />
                Show ended courses
              </label>
            )}
          </div>
        )}
      </div>

      {/* Personal section */}
      <div>
        <button
          type="button"
          onClick={() => setPersonalOpen(!personalOpen)}
          className="flex items-center gap-1 w-full text-left px-2 py-1.5 text-sm font-medium hover:bg-accent rounded transition-colors"
        >
          {personalOpen ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
          Personal
        </button>
        {personalOpen && (
          <div className="ml-4 space-y-0.5">
            {filteredProjects.length === 0 ? (
              <p className="text-xs text-muted-foreground px-2 py-1">
                No projects available
              </p>
            ) : (
              filteredProjects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => handleSelectProject(project.id)}
                  className={cn(
                    "w-full text-left px-2 py-1.5 text-sm rounded flex items-center gap-2 transition-colors",
                    selectedProjectId === project.id
                      ? "bg-foreground text-background font-medium"
                      : "hover:bg-accent"
                  )}
                >
                  <span className="truncate">{project.name}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
