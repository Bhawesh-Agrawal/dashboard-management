"use client";

import { useState } from "react";
import { createResource } from "@/features/library/lib/actions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";

export function CreateResourceDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const tagsRaw = formData.get("tags") as string;

    await createResource({
      title: formData.get("title") as string,
      url: (formData.get("url") as string) || undefined,
      notes: (formData.get("notes") as string) || undefined,
      tags: tagsRaw
        ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean)
        : undefined,
    });

    setLoading(false);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<button className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors" />}>
          <Plus className="h-4 w-4" />
          New Resource
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">New Resource</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <label htmlFor="title" className="section-label">Title</label>
            <input
              id="title"
              name="title"
              required
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="Resource title"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="url" className="section-label">URL</label>
            <input
              id="url"
              name="url"
              type="url"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="https://..."
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="notes" className="section-label">Notes</label>
            <textarea
              id="notes"
              name="notes"
              rows={2}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
              placeholder="Optional notes..."
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="tags" className="section-label">Tags</label>
            <input
              id="tags"
              name="tags"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="Comma-separated tags..."
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create Resource"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
