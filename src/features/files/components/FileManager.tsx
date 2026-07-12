"use client";

import { useState, useEffect } from "react";
import { Upload, FolderOpen } from "lucide-react";
import { FileList } from "./FileList";
import { FileUploadDialog } from "./FileUploadDialog";
import { getFileAttachments } from "../lib/actions";
import type { FileAttachment } from "../lib/actions";

const SEMESTER_CATEGORIES = [
  { value: "all", label: "All" },
  { value: "syllabus", label: "Syllabus" },
  { value: "routine", label: "Routine" },
  { value: "calendar", label: "Calendar" },
  { value: "other", label: "Other" },
];

export interface FileManagerProps {
  semesterId?: string;
  courseId?: string;
  semesterName?: string;
  courseName?: string;
}

export function FileManager({
  semesterId,
  courseId,
  semesterName,
  courseName,
}: FileManagerProps) {
  const [files, setFiles] = useState<FileAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState("all");

  const isSemesterLevel = !!semesterId && !courseId;

  const reloadFiles = async () => {
    setLoading(true);
    const result = await getFileAttachments({ semesterId, courseId });
    if (result.ok) {
      setFiles(result.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    async function fetch() {
      setLoading(true);
      const result = await getFileAttachments({
        semesterId,
        courseId,
      });
      if (!cancelled) {
        if (result.ok) {
          setFiles(result.data);
        }
        setLoading(false);
      }
    }
    fetch();
    return () => {
      cancelled = true;
    };
  }, [semesterId, courseId]);

  function handleDelete(id: string) {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }

  // Get unique tags from all files
  const allTags = [...new Set(files.flatMap((f) => f.tags))];

  // Filter files by category or tag
  const filteredFiles =
    activeCategory === "all"
      ? files
      : isSemesterLevel
        ? files.filter((f) => f.category === activeCategory)
        : files.filter((f) => f.tags.includes(activeCategory));

  const title = courseName ? "Course Materials" : "Semester Files";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="page-heading text-lg">{title}</h2>
        <button
          type="button"
          onClick={() => setUploadDialogOpen(true)}
          className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Upload className="h-4 w-4" />
          Upload
        </button>
      </div>

      {/* Category/Tag filter tabs */}
      {((isSemesterLevel && SEMESTER_CATEGORIES.length > 0) ||
        (!isSemesterLevel && allTags.length > 0)) && (
        <div className="flex gap-2 flex-wrap">
          {isSemesterLevel
            ? SEMESTER_CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setActiveCategory(cat.value)}
                  className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
                    activeCategory === cat.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {cat.label}
                  {cat.value !== "all" && (
                    <span className="ml-1 text-xs opacity-70">
                      (
                      {cat.value === "all"
                        ? files.length
                        : files.filter((f) => f.category === cat.value).length}
                      )
                    </span>
                  )}
                </button>
              ))
            : [
                { value: "all", label: "All" },
                ...allTags.map((t) => ({ value: t, label: t })),
              ].map((tag) => (
                <button
                  key={tag.value}
                  type="button"
                  onClick={() => setActiveCategory(tag.value)}
                  className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
                    activeCategory === tag.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tag.label}
                </button>
              ))}
        </div>
      )}

      {/* File list */}
      {loading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
          Loading files...
        </div>
      ) : filteredFiles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground border border-dashed rounded-lg">
          <FolderOpen className="h-10 w-10 mb-3 opacity-50" />
          <p className="text-sm">
            {files.length === 0
              ? "No files uploaded yet"
              : "No files match this filter"}
          </p>
          {files.length === 0 && (
            <button
              type="button"
              onClick={() => setUploadDialogOpen(true)}
              className="mt-3 text-sm text-primary hover:underline"
            >
              Upload your first file
            </button>
          )}
        </div>
      ) : (
        <FileList
          files={filteredFiles}
          onDelete={handleDelete}
          showTags={!isSemesterLevel}
          showCategory={false}
        />
      )}

      {/* Upload dialog */}
      <FileUploadDialog
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        semesterId={semesterId}
        courseId={courseId}
        semesterName={semesterName}
        courseName={courseName}
        onUploadComplete={reloadFiles}
      />
    </div>
  );
}
