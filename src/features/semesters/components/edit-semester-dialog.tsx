"use client";

import { useState } from "react";
import { updateSemester, deleteSemester } from "@/features/semesters/lib/actions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Pencil, Trash2 } from "lucide-react";

type SemesterData = {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  gradingScale: string;
};

export function EditSemesterDialog({
  semester,
}: {
  semester: SemesterData;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);

    await updateSemester(semester.id, {
      name: formData.get("name") as string,
      startDate: formData.get("startDate") as string,
      endDate: formData.get("endDate") as string,
      gradingScale: formData.get("gradingScale") as "ten_point" | "four_point",
    });

    setLoading(false);
    setOpen(false);
  }

  async function handleDelete() {
    if (!confirm("Delete this semester and all its courses?")) return;
    setLoading(true);
    await deleteSemester(semester.id);
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
          <DialogTitle className="font-serif text-xl">Edit Semester</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <label htmlFor="edit-name" className="section-label">
              Semester Name
            </label>
            <input
              id="edit-name"
              name="name"
              required
              defaultValue={semester.name}
              placeholder="Fall 2026"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label htmlFor="edit-startDate" className="section-label">
                Start Date
              </label>
              <input
                id="edit-startDate"
                name="startDate"
                type="date"
                required
                defaultValue={new Date(semester.startDate).toISOString().slice(0, 10)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="edit-endDate" className="section-label">
                End Date
              </label>
              <input
                id="edit-endDate"
                name="endDate"
                type="date"
                required
                defaultValue={new Date(semester.endDate).toISOString().slice(0, 10)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="space-y-2">
            <label htmlFor="edit-gradingScale" className="section-label">
              Grading Scale
            </label>
            <select
              id="edit-gradingScale"
              name="gradingScale"
              defaultValue={semester.gradingScale}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="ten_point">10-Point Scale</option>
              <option value="four_point">4-Point Scale (GPA)</option>
            </select>
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
