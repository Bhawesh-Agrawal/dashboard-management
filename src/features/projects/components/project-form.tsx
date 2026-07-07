"use client";

import { useState } from "react";
import { createProject } from "@/features/projects/lib/actions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";

type DomainOption = { id: string; name: string };

export function CreateProjectDialog({
  domains,
  defaultDomainId,
}: {
  domains: DomainOption[];
  defaultDomainId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);

    await createProject({
      domainId: formData.get("domainId") as string,
      name: formData.get("name") as string,
      description: (formData.get("description") as string) || undefined,
      color: (formData.get("color") as string) || undefined,
    });

    setLoading(false);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<button className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors" />}>
          <Plus className="h-4 w-4" />
          New Project
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">New Project</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <label htmlFor="name" className="section-label">
              Name
            </label>
            <input
              id="name"
              name="name"
              required
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="Project name"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="domainId" className="section-label">
              Domain
            </label>
            <select
              id="domainId"
              name="domainId"
              defaultValue={defaultDomainId || ""}
              required
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {domains.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label htmlFor="description" className="section-label">
              Description
            </label>
            <textarea
              id="description"
              name="description"
              rows={2}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
              placeholder="Optional description..."
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="color" className="section-label">
              Color
            </label>
            <input
              id="color"
              name="color"
              type="color"
              className="h-10 w-16 rounded-md border border-input bg-background cursor-pointer"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create Project"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
