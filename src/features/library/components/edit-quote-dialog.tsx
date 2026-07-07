"use client";

import { useState } from "react";
import { updateQuote } from "@/features/library/lib/actions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Pencil } from "lucide-react";

type QuoteData = {
  id: string;
  text: string;
  source: string | null;
  tags: string[];
};

export function EditQuoteDialog({ quote }: { quote: QuoteData }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const tagsRaw = formData.get("tags") as string;

    await updateQuote(quote.id, {
      text: formData.get("text") as string,
      source: (formData.get("source") as string) || undefined,
      tags: tagsRaw
        ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean)
        : [],
    });

    setLoading(false);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<button className="p-1 rounded hover:bg-accent transition-colors" />}>
        <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">Edit Quote</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <label htmlFor="edit-text" className="section-label">Quote</label>
            <textarea
              id="edit-text"
              name="text"
              rows={3}
              required
              defaultValue={quote.text}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="edit-source" className="section-label">Source</label>
            <input
              id="edit-source"
              name="source"
              defaultValue={quote.source || ""}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="edit-tags" className="section-label">Tags</label>
            <input
              id="edit-tags"
              name="tags"
              defaultValue={quote.tags.join(", ")}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? "Saving..." : "Save Changes"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
