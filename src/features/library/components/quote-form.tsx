"use client";

import { useState } from "react";
import { createQuote } from "@/features/library/lib/actions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";

export function CreateQuoteDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const tagsRaw = formData.get("tags") as string;

    await createQuote({
      text: formData.get("text") as string,
      source: (formData.get("source") as string) || undefined,
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
          New Quote
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">New Quote</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <label htmlFor="text" className="section-label">Quote</label>
            <textarea
              id="text"
              name="text"
              rows={3}
              required
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
              placeholder="The quote text..."
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="source" className="section-label">Source</label>
            <input
              id="source"
              name="source"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="Author or source..."
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
            {loading ? "Creating..." : "Create Quote"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
