"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { QuoteMeta } from "../lib/capture-types";
import { formatQuoteMarkdown } from "../lib/meeting-format";
import { updateCaptureNote } from "../lib/capture-actions";

export interface QuoteEditorProps {
  noteId: string;
  initialMeta: QuoteMeta;
  onUpdated?: () => void;
}

export function QuoteEditor({ noteId, initialMeta, onUpdated }: QuoteEditorProps) {
  const [text, setText] = useState(initialMeta.text);
  const [source, setSource] = useState(initialMeta.source ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSaving(true);
    const meta: QuoteMeta = { text: trimmed, source: source.trim() || null };
    const res = await updateCaptureNote(noteId, {
      content: formatQuoteMarkdown(meta),
      meta,
    });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Quote updated");
    onUpdated?.();
  }

  return (
    <div className="space-y-2.5">
      <textarea
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Quote text..."
        className="w-full rounded-lg border border-input bg-background p-3 text-sm text-foreground"
      />
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder="Source / author (optional)"
          className="flex-1 min-w-[180px] min-h-[44px] rounded-lg border border-input bg-background px-3 text-sm text-foreground"
        />
        <button
          type="button"
          disabled={!text.trim() || saving}
          onClick={() => void handleSave()}
          className="min-h-[44px] rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
