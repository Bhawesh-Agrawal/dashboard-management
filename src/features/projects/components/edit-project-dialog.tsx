"use client";

import { useState } from "react";
import { updateProject, deleteProject } from "@/features/projects/lib/actions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Pencil } from "lucide-react";

type ProjectData = {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  status: string;
};

export function EditProjectDialog({ project }: { project: ProjectData }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);

    await updateProject(project.id, {
      name: formData.get("name") as string,
      description: (formData.get("description") as string) || undefined,
      color: (formData.get("color") as string) || undefined,
      status: formData.get("status") as "active" | "completed" | "archived",
    });

    setLoading(false);
    setOpen(false);
  }

  async function handleDelete() {
    if (!confirm("Delete this project? Tasks will be unlinked but not deleted.")) return;
    await deleteProject(project.id);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<button className="p-1 rounded hover:bg-accent transition-colors" />}>
        <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">Edit Project</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <label htmlFor="edit-name" className="section-label">Name</label>
            <input
              id="edit-name"
              name="name"
              required
              defaultValue={project.name}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="edit-description" className="section-label">Description</label>
            <textarea
              id="edit-description"
              name="description"
              rows={2}
              defaultValue={project.description || ""}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label htmlFor="edit-status" className="section-label">Status</label>
              <select
                id="edit-status"
                name="status"
                defaultValue={project.status}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <div className="space-y-2">
              <label htmlFor="edit-color" className="section-label">Color</label>
              <input
                id="edit-color"
                name="color"
                type="color"
                defaultValue={project.color || "#000000"}
                className="h-10 w-16 rounded-md border border-input bg-background cursor-pointer"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading}
              className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {loading ? "Saving..." : "Save Changes"}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="inline-flex h-10 items-center justify-center rounded-md border border-destructive px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
            >
              Delete
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
