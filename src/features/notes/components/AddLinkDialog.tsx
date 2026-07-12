"use client";

import { useState, useCallback } from "react";
import { Link, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { addNoteLinkAttachment } from "@/features/notes/lib/actions-attachments";
import { toast } from "sonner";

export interface AddLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  noteId: string;
  onAdd: () => void;
}

interface LinkMetadata {
  title: string;
  description: string;
  image: string | null;
  favicon: string | null;
}

export function AddLinkDialog({
  open,
  onOpenChange,
  noteId,
  onAdd,
}: AddLinkDialogProps) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [metadata, setMetadata] = useState<LinkMetadata | null>(null);
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMetadata = useCallback(async (targetUrl: string) => {
    if (!targetUrl) return;

    try {
      new URL(targetUrl);
    } catch {
      setError("Please enter a valid URL");
      return;
    }

    setFetching(true);
    setError(null);

    try {
      const res = await fetch("/api/notes/link-metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: targetUrl }),
      });

      const data = await res.json();
      setMetadata(data);
      if (data.title && !title) {
        setTitle(data.title);
      }
    } catch {
      setMetadata({ title: "", description: "", image: null, favicon: null });
    } finally {
      setFetching(false);
    }
  }, [title]);

  function handleUrlBlur() {
    if (url && url !== metadata?.description) {
      fetchMetadata(url);
    }
  }

  async function handleAdd() {
    if (!url.trim()) {
      setError("URL is required");
      return;
    }

    try {
      new URL(url);
    } catch {
      setError("Please enter a valid URL");
      return;
    }

    setSaving(true);
    setError(null);

    const result = await addNoteLinkAttachment(noteId, {
      url: url.trim(),
      title: title.trim() || metadata?.title || new URL(url).hostname,
      description: metadata?.description ?? undefined,
      favicon: metadata?.favicon ?? undefined,
    });

    if (result.ok) {
      toast.success("Link added");
      setUrl("");
      setTitle("");
      setMetadata(null);
      onOpenChange(false);
      onAdd();
    } else {
      setError(result.error);
    }

    setSaving(false);
  }

  function handleClose() {
    if (saving) return;
    setUrl("");
    setTitle("");
    setMetadata(null);
    setError(null);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl flex items-center gap-2">
            <Link className="h-5 w-5" />
            Add Link
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* URL input */}
          <div className="space-y-1.5">
            <label htmlFor="link-url" className="section-label">
              URL
            </label>
            <input
              id="link-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onBlur={handleUrlBlur}
              placeholder="https://example.com/article"
              autoFocus
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>

          {/* Title input */}
          <div className="space-y-1.5">
            <label htmlFor="link-title" className="section-label">
              Title
            </label>
            <input
              id="link-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Link title"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>

          {/* Metadata preview */}
          {(fetching || metadata) && (
            <div className="rounded-md border border-[#E5E2DD] bg-muted/30 p-3">
              {fetching ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Fetching preview…
                </div>
              ) : metadata ? (
                <div className="flex gap-3">
                  {metadata.image && (
                    <img
                      src={metadata.image}
                      alt=""
                      className="h-16 w-16 rounded object-cover shrink-0 border border-[#E5E2DD]"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {metadata.favicon && (
                        <img
                          src={metadata.favicon}
                          alt=""
                          className="h-3.5 w-3.5"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                      )}
                      <span className="text-xs text-muted-foreground truncate">
                        {new URL(url).hostname}
                      </span>
                    </div>
                    {metadata.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {metadata.description}
                      </p>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {/* Error */}
          {error && <p className="text-xs text-destructive">{error}</p>}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={saving}
              className="inline-flex h-9 items-center justify-center rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAdd}
              disabled={!url.trim() || saving}
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving ? "Adding…" : "Add Link"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
