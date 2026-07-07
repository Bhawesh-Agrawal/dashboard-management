"use client";

import { useState } from "react";
import { createCourse } from "@/features/courses/lib/actions";
import { COURSE_COLORS } from "@/lib/constants";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";

export function CreateCourseDialog({ semesterId }: { semesterId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedColor, setSelectedColor] = useState<string>(COURSE_COLORS[0].value);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);

    await createCourse({
      semesterId,
      name: formData.get("name") as string,
      code: (formData.get("code") as string) || undefined,
      credits: parseInt(formData.get("credits") as string),
      instructor: (formData.get("instructor") as string) || undefined,
      color: selectedColor,
    });

    setLoading(false);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<button className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors" />}>
          <Plus className="h-4 w-4" />
          New Course
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">New Course</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <label htmlFor="name" className="section-label">
              Course Name
            </label>
            <input
              id="name"
              name="name"
              required
              placeholder="e.g. Data Structures"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label htmlFor="code" className="section-label">
                Code
              </label>
              <input
                id="code"
                name="code"
                placeholder="e.g. CS301"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="credits" className="section-label">
                Credits
              </label>
              <input
                id="credits"
                name="credits"
                type="number"
                min="1"
                max="10"
                required
                defaultValue="3"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="space-y-2">
            <label htmlFor="instructor" className="section-label">
              Instructor
            </label>
            <input
              id="instructor"
              name="instructor"
              placeholder="e.g. Dr. Smith"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-2">
            <label className="section-label">Color</label>
            <div className="flex gap-2">
              {COURSE_COLORS.map((color) => (
                <button
                  key={color.value}
                  type="button"
                  onClick={() => setSelectedColor(color.value)}
                  className={`h-7 w-7 rounded-full border-2 transition-all ${
                    selectedColor === color.value
                      ? "border-foreground scale-110"
                      : "border-transparent"
                  }`}
                  style={{ backgroundColor: color.value }}
                  title={color.name}
                />
              ))}
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create Course"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
