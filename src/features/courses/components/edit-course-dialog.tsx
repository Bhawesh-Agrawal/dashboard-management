"use client";

import { useState } from "react";
import { updateCourse, deleteCourse } from "@/features/courses/lib/actions";
import { COURSE_COLORS } from "@/lib/constants";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Pencil, Trash2 } from "lucide-react";

type CourseData = {
  id: string;
  name: string;
  code: string | null;
  credits: number;
  instructor: string | null;
  color: string | null;
  targetGrade: string | null;
  semesterId: string;
};

export function EditCourseDialog({
  course,
}: {
  course: CourseData;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);

    await updateCourse(course.id, {
      name: formData.get("name") as string,
      code: (formData.get("code") as string) || undefined,
      credits: parseInt(formData.get("credits") as string) || 3,
      instructor: (formData.get("instructor") as string) || undefined,
      color: (formData.get("color") as string) || undefined,
      targetGrade: (formData.get("targetGrade") as string) || undefined,
    });

    setLoading(false);
    setOpen(false);
  }

  async function handleDelete() {
    if (!confirm("Delete this course and all its data?")) return;
    setLoading(true);
    await deleteCourse(course.id);
    setLoading(false);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<button className="p-1 text-muted-foreground hover:text-foreground transition-colors" />}
      >
        <Pencil className="h-3.5 w-3.5" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">Edit Course</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label htmlFor="edit-name" className="section-label">
                Course Name
              </label>
              <input
                id="edit-name"
                name="name"
                required
                defaultValue={course.name}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="edit-code" className="section-label">
                Code
              </label>
              <input
                id="edit-code"
                name="code"
                defaultValue={course.code || ""}
                placeholder="CS301"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label htmlFor="edit-credits" className="section-label">
                Credits
              </label>
              <input
                id="edit-credits"
                name="credits"
                type="number"
                min="1"
                max="10"
                required
                defaultValue={course.credits}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="edit-instructor" className="section-label">
                Instructor
              </label>
              <input
                id="edit-instructor"
                name="instructor"
                defaultValue={course.instructor || ""}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="section-label">Color</label>
            <div className="flex gap-2">
              {COURSE_COLORS.map((c) => (
                <label key={c.value} className="cursor-pointer">
                  <input
                    type="radio"
                    name="color"
                    value={c.value}
                    defaultChecked={course.color === c.value}
                    className="sr-only"
                  />
                  <span
                    className="block h-6 w-6 rounded-full border-2 transition-all"
                    style={{
                      backgroundColor: c.value,
                      borderColor:
                        course.color === c.value
                          ? "var(--foreground)"
                          : "transparent",
                    }}
                  />
                </label>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={handleDelete}
              disabled={loading}
              className="inline-flex items-center gap-1 text-sm text-destructive hover:text-destructive/80 transition-colors disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {loading ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
