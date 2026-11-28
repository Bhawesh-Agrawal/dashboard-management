"use client";

import { useEffect, useRef, useState } from "react";
import {
  ClipboardPaste,
  FileText,
  Link2,
  ListChecks,
  Quote,
  RefreshCw,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useHideMobileNav } from "@/lib/ui/fullscreen-flow";
import {
  NOTE_KINDS,
  type ChecklistItem,
  type NoteKind,
} from "../lib/capture-types";
import {
  clearCaptureDraft,
  extractFirstUrl,
  loadCaptureDraft,
  looksLikeUrl,
  saveCaptureDraft,
} from "../lib/capture-draft";
import { createCaptureNote, undoCaptureNote } from "../lib/capture-actions";
import { extractCaptureActionItemsAction } from "../lib/notes-ai-actions";

const KIND_META: Record<NoteKind, { label: string; icon: typeof FileText; placeholder: string }> = {
  note: {
    label: "Note",
    icon: FileText,
    placeholder: "Jot down a thought, reminder, or snippet...",
  },
  link: {
    label: "Link",
    icon: Link2,
    placeholder: "Paste a URL (YouTube, Spotify, article...)",
  },
  quote: {
    label: "Quote",
    icon: Quote,
    placeholder: "Paste or type a quote or line...",
  },
  meeting: {
    label: "Meeting",
    icon: Users,
    placeholder: "Key points from the meeting...",
  },
  checklist: {
    label: "Steps",
    icon: ListChecks,
    placeholder: "One step per line...",
  },
};

export interface CaptureSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialKind?: NoteKind;
  initialText?: string;
  initialTitle?: string;
  initialUrl?: string;
  onCaptured?: (id: string) => void;
}

export function CaptureSheet({
  open,
  onOpenChange,
  initialKind,
  initialText,
  initialTitle,
  initialUrl,
  onCaptured,
}: CaptureSheetProps) {
  useHideMobileNav("notes-capture-sheet", open);

  const [kind, setKind] = useState<NoteKind>(initialKind ?? "note");
  const [text, setText] = useState(initialText ?? initialUrl ?? "");
  const [title, setTitle] = useState(initialTitle ?? "");
  const [quoteSource, setQuoteSource] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Restore draft or seed initial share values when opened
  useEffect(() => {
    if (!open) return;
    if (initialText || initialUrl || initialTitle || initialKind) {
      const seedText = initialUrl || initialText || "";
      setKind(initialKind ?? (looksLikeUrl(seedText) ? "link" : "note"));
      setText(seedText);
      setTitle(initialTitle ?? "");
      setSaveError(null);
    } else {
      const draft = loadCaptureDraft();
      if (draft && draft.text.trim()) {
        setKind(draft.kind);
        setText(draft.text);
        setTitle(draft.title ?? "");
        setQuoteSource(draft.source ?? "");
      }
    }
    const timer = setTimeout(() => {
      textareaRef.current?.focus();
    }, 60);
    return () => clearTimeout(timer);
  }, [open, initialKind, initialText, initialTitle, initialUrl]);

  // Persist draft locally while typing
  useEffect(() => {
    if (!open) return;
    if (!text.trim()) return;
    saveCaptureDraft({ kind, text, title: title || undefined, source: quoteSource || undefined });
  }, [open, kind, text, title, quoteSource]);

  function handleTextChange(next: string) {
    setText(next);
    setSaveError(null);
    if (kind === "note" && looksLikeUrl(next)) {
      setKind("link");
    }
  }

  function handlePasteFromEvent(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const pasted = e.clipboardData.getData("text");
    if (pasted && looksLikeUrl(pasted) && kind === "note") {
      setKind("link");
    }
  }

  async function handlePasteClipboard() {
    try {
      const clip = await navigator.clipboard.readText();
      if (!clip.trim()) {
        toast.info("Clipboard is empty");
        return;
      }
      const next = text.trim() ? `${text.trimEnd()}\n${clip}` : clip;
      setText(next);
      setSaveError(null);
      if (extractFirstUrl(clip) && kind === "note") {
        setKind("link");
      }
      textareaRef.current?.focus();
    } catch {
      toast.error("Could not read clipboard");
    }
  }

  async function handleSave() {
    const trimmed = text.trim();
    if (!trimmed || saving) return;

    setSaving(true);
    setSaveError(null);

    // Build kind-specific meta and markdown content
    let payloadMeta: unknown;
    let payloadContent = trimmed;
    let payloadTitle = title.trim() || null;
    let payloadSourceLink: string | null = null;

    if (kind === "link") {
      const url = extractFirstUrl(trimmed);
      if (!url) {
        setSaveError("Enter a valid http(s) URL");
        setSaving(false);
        return;
      }
      payloadSourceLink = url;
      const host = new URL(url).hostname.replace(/^www\./, "");
      payloadMeta = { url, host, contentType: "generic" };
      if (!payloadTitle) payloadTitle = host;
    } else if (kind === "quote") {
      payloadMeta = {
        text: trimmed,
        source: quoteSource.trim() || null,
      };
      payloadContent = quoteSource.trim() ? `"${trimmed}" — ${quoteSource.trim()}` : `"${trimmed}"`;
    } else if (kind === "checklist") {
      const items: ChecklistItem[] = trimmed
        .split(/\r?\n/)
        .map((line) => line.replace(/^[-*•]\s*/, "").trim())
        .filter(Boolean)
        .map((line) => ({ text: line, done: false }));
      payloadMeta = { items };
      payloadContent = items.map((i) => `- [ ] ${i.text}`).join("\n");
    } else if (kind === "meeting") {
      const todayIso = new Date().toISOString().slice(0, 10);
      if (!payloadTitle) payloadTitle = `Meeting, ${todayIso}`;
      payloadMeta = {
        date: todayIso,
        attendees: "",
        agenda: "",
        decisions: "",
        actionItems: [],
        nextMeeting: null,
      };
    }

    const result = await createCaptureNote({
      kind,
      title: payloadTitle,
      content: payloadContent,
      sourceLink: payloadSourceLink,
      meta: payloadMeta,
    });

    setSaving(false);

    if (!result.ok) {
      saveCaptureDraft({ kind, text: trimmed, title: title || undefined, source: quoteSource || undefined });
      setSaveError("Not saved, tap to retry");
      return;
    }

    const createdId = result.data.id;
    clearCaptureDraft();
    setText("");
    setTitle("");
    setQuoteSource("");
    setSaveError(null);
    onOpenChange(false);
    onCaptured?.(createdId);

    // Background link enrichment (never blocks save)
    if (result.data.kind === "link" && result.data.url) {
      void fetch("/api/notes/link-metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: result.data.url, noteId: createdId }),
      }).catch(() => {});
    }

    toast.success("Saved", {
      duration: 10000,
      action: {
        label: "Undo",
        onClick: () => {
          void undoCaptureNote(createdId).then((res) => {
            if (res.ok) {
              toast.info("Capture removed");
            }
          });
        },
      },
    });
  }

  const activeConfig = KIND_META[kind];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl px-4 pt-4 pb-6 max-w-2xl mx-auto">
        <SheetHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <SheetTitle className="font-serif text-lg">Quick Capture</SheetTitle>
          <button
            type="button"
            onClick={handlePasteClipboard}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 text-xs font-medium text-secondary-foreground hover:bg-secondary/80"
          >
            <ClipboardPaste className="h-3.5 w-3.5" aria-hidden="true" />
            Paste
          </button>
        </SheetHeader>

        {/* Kind chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-3 no-scrollbar">
          {NOTE_KINDS.map((k) => {
            const Icon = KIND_META[k].icon;
            const selected = kind === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-xs font-medium transition-colors ${
                  selected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {KIND_META[k].label}
              </button>
            );
          })}
        </div>

        <div className="space-y-3">
          {(kind === "meeting" || kind === "checklist") && (
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                kind === "meeting"
                  ? `Meeting, ${new Date().toISOString().slice(0, 10)}`
                  : "Title for these steps (optional)"
              }
              className="w-full min-h-[44px] rounded-lg border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground"
            />
          )}

          <textarea
            ref={textareaRef}
            rows={4}
            value={text}
            onChange={(e) => handleTextChange(e.target.value)}
            onPaste={handlePasteFromEvent}
            placeholder={activeConfig.placeholder}
            className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-ring"
          />

          {kind === "quote" && (
            <input
              type="text"
              value={quoteSource}
              onChange={(e) => setQuoteSource(e.target.value)}
              placeholder="Source / author (optional)"
              className="w-full min-h-[44px] rounded-lg border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground"
            />
          )}

          {saveError && (
            <button
              type="button"
              onClick={handleSave}
              className="flex w-full min-h-[44px] items-center justify-between rounded-lg border border-destructive/40 bg-destructive/10 px-3 text-xs font-medium text-destructive"
            >
              <span>{saveError}</span>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}

          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Cancel capture"
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-border px-3 text-sm text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={!text.trim() || saving}
              onClick={() => {
                void extractCaptureActionItemsAction(text).then((res) => {
                  if (!res.ok) {
                    toast.error(res.error);
                    return;
                  }
                  setKind("checklist");
                  setText(res.items.map((i) => i.text).join("\n"));
                  toast.success("Extracted action items");
                });
              }}
              className="min-h-[44px] rounded-lg border border-border px-3 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
            >
              Extract steps
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!text.trim() || saving}
              className="flex-1 min-h-[44px] rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
