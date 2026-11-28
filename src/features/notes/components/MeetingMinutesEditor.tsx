"use client";

import { useState } from "react";
import {
  Check,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Copy,
  ListTodo,
  Plus,
  Share2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import type { MeetingActionItem, MeetingMeta } from "../lib/capture-types";
import { formatMeetingMarkdown, formatMeetingPlainText } from "../lib/meeting-format";
import {
  convertMeetingActionItemsToTasks,
  updateCaptureNote,
} from "../lib/capture-actions";
import { tidyMeetingMinutesAction } from "../lib/notes-ai-actions";

export interface MeetingMinutesEditorProps {
  noteId: string;
  initialTitle: string;
  initialContent: string;
  initialMeta: MeetingMeta;
  onUpdated?: () => void;
}

export function MeetingMinutesEditor({
  noteId,
  initialTitle,
  initialContent,
  initialMeta,
  onUpdated,
}: MeetingMinutesEditorProps) {
  const [title, setTitle] = useState(initialTitle || `Meeting, ${initialMeta.date}`);
  const [meta, setMeta] = useState<MeetingMeta>(initialMeta);
  const [notesBody, setNotesBody] = useState(initialContent);
  const [saving, setSaving] = useState(false);
  const [converting, setConverting] = useState(false);

  // Collapsed sections except notes and action items
  const [showDetails, setShowDetails] = useState(false);
  const [showDecisions, setShowDecisions] = useState(false);

  // Quick-add action item inputs
  const [newItemText, setNewItemText] = useState("");
  const [newItemOwner, setNewItemOwner] = useState("");
  const [newItemDue, setNewItemDue] = useState("");

  async function persist(nextTitle: string, nextMeta: MeetingMeta, nextNotes: string) {
    setSaving(true);
    const res = await updateCaptureNote(noteId, {
      title: nextTitle.trim() || `Meeting, ${nextMeta.date}`,
      content: formatMeetingMarkdown(nextMeta, nextNotes),
      meta: nextMeta,
    });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    onUpdated?.();
  }

  function handleAddActionItem() {
    const trimmed = newItemText.trim();
    if (!trimmed) return;
    const item: MeetingActionItem = {
      text: trimmed,
      done: false,
      owner: newItemOwner.trim() || null,
      due: newItemDue.trim() || null,
      taskId: null,
    };
    const nextMeta: MeetingMeta = {
      ...meta,
      actionItems: [...meta.actionItems, item],
    };
    setMeta(nextMeta);
    setNewItemText("");
    setNewItemOwner("");
    setNewItemDue("");
    void persist(title, nextMeta, notesBody);
  }

  function handleToggleActionItem(index: number) {
    const updated = meta.actionItems.map((item, i) =>
      i === index ? { ...item, done: !item.done } : item
    );
    const nextMeta: MeetingMeta = { ...meta, actionItems: updated };
    setMeta(nextMeta);
    void persist(title, nextMeta, notesBody);
  }

  function handleRemoveActionItem(index: number) {
    const updated = meta.actionItems.filter((_, i) => i !== index);
    const nextMeta: MeetingMeta = { ...meta, actionItems: updated };
    setMeta(nextMeta);
    void persist(title, nextMeta, notesBody);
  }

  async function handleConvertTasks(indices?: number[]) {
    setConverting(true);
    const res = await convertMeetingActionItemsToTasks(noteId, indices);
    setConverting(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setMeta(res.data.meta);
    const count = res.data.createdTaskIds.length;
    toast.success(count === 0 ? "All items already converted" : `Created ${count} task${count === 1 ? "" : "s"}`);
    onUpdated?.();
  }

  async function handleCopyText() {
    const plain = formatMeetingPlainText(title, meta, notesBody);
    try {
      await navigator.clipboard.writeText(plain);
      toast.success("Copied meeting minutes");
    } catch {
      toast.error("Could not copy to clipboard");
    }
  }

  async function handleShare() {
    const plain = formatMeetingPlainText(title, meta, notesBody);
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, text: plain });
        return;
      } catch {
        // User cancelled or share failed; fall back to copy
      }
    }
    await handleCopyText();
  }

  const unconvertedCount = meta.actionItems.filter((i) => !i.taskId).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => void persist(title, meta, notesBody)}
          placeholder={`Meeting, ${meta.date}`}
          className="flex-1 min-w-[200px] min-h-[44px] rounded-lg border border-input bg-background px-3 text-base font-medium text-foreground"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              void tidyMeetingMinutesAction(noteId).then((res) => {
                if (!res.ok) {
                  toast.error(res.error);
                  return;
                }
                const nextMeta: MeetingMeta = {
                  ...meta,
                  decisions: res.draft.decisions || meta.decisions,
                  actionItems: [
                    ...meta.actionItems,
                    ...res.draft.actionItems.map((a) => ({
                      text: a.text,
                      done: false,
                      owner: a.owner ?? null,
                      due: a.due ?? null,
                      taskId: null,
                    })),
                  ],
                };
                setMeta(nextMeta);
                toast.success("Draft applied — review and blur/save to keep");
              });
            }}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-muted"
          >
            Tidy minutes
          </button>
          <button
            type="button"
            onClick={handleCopyText}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-muted"
          >
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            Copy as text
          </button>
          <button
            type="button"
            onClick={handleShare}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-muted"
          >
            <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
            Share
          </button>
        </div>
      </div>

      {/* Collapsible Details: Date, Attendees, Agenda, Next Meeting */}
      <div className="rounded-lg border border-border bg-card">
        <button
          type="button"
          onClick={() => setShowDetails((v) => !v)}
          className="flex w-full min-h-[44px] items-center justify-between px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground"
        >
          <span>Meeting Details ({meta.date})</span>
          {showDetails ? (
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
        {showDetails && (
          <div className="space-y-3 border-t border-border p-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="space-y-1 text-xs text-muted-foreground">
                <span>Date</span>
                <input
                  type="date"
                  value={meta.date}
                  onChange={(e) => setMeta({ ...meta, date: e.target.value })}
                  onBlur={() => void persist(title, meta, notesBody)}
                  className="w-full min-h-[44px] rounded-md border border-input bg-background px-2.5 text-sm text-foreground"
                />
              </label>
              <label className="space-y-1 text-xs text-muted-foreground">
                <span>Next Meeting</span>
                <input
                  type="text"
                  value={meta.nextMeeting ?? ""}
                  onChange={(e) => setMeta({ ...meta, nextMeeting: e.target.value || null })}
                  onBlur={() => void persist(title, meta, notesBody)}
                  placeholder="Optional date or topic"
                  className="w-full min-h-[44px] rounded-md border border-input bg-background px-2.5 text-sm text-foreground"
                />
              </label>
            </div>
            <label className="block space-y-1 text-xs text-muted-foreground">
              <span>Attendees</span>
              <input
                type="text"
                value={meta.attendees}
                onChange={(e) => setMeta({ ...meta, attendees: e.target.value })}
                onBlur={() => void persist(title, meta, notesBody)}
                placeholder="Names separated by commas"
                className="w-full min-h-[44px] rounded-md border border-input bg-background px-2.5 text-sm text-foreground"
              />
            </label>
            <label className="block space-y-1 text-xs text-muted-foreground">
              <span>Agenda</span>
              <textarea
                rows={2}
                value={meta.agenda}
                onChange={(e) => setMeta({ ...meta, agenda: e.target.value })}
                onBlur={() => void persist(title, meta, notesBody)}
                placeholder="Topics to cover..."
                className="w-full rounded-md border border-input bg-background p-2.5 text-sm text-foreground"
              />
            </label>
          </div>
        )}
      </div>

      {/* Notes (expanded by default) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="section-label">Notes</span>
          {saving && <span className="text-xs text-muted-foreground">Saving...</span>}
        </div>
        <textarea
          rows={5}
          value={notesBody}
          onChange={(e) => setNotesBody(e.target.value)}
          onBlur={() => void persist(title, meta, notesBody)}
          placeholder="Meeting discussion notes..."
          className="w-full rounded-lg border border-input bg-background p-3 text-sm text-foreground"
        />
      </div>

      {/* Collapsible Decisions */}
      <div className="rounded-lg border border-border bg-card">
        <button
          type="button"
          onClick={() => setShowDecisions((v) => !v)}
          className="flex w-full min-h-[44px] items-center justify-between px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground"
        >
          <span>Decisions</span>
          {showDecisions ? (
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
        {showDecisions && (
          <div className="border-t border-border p-3">
            <textarea
              rows={3}
              value={meta.decisions}
              onChange={(e) => setMeta({ ...meta, decisions: e.target.value })}
              onBlur={() => void persist(title, meta, notesBody)}
              placeholder="Agreed decisions..."
              className="w-full rounded-md border border-input bg-background p-2.5 text-sm text-foreground"
            />
          </div>
        )}
      </div>

      {/* Action Items (expanded by default) */}
      <div className="space-y-2 rounded-lg border border-border bg-card p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="section-label">Action Items ({meta.actionItems.length})</span>
          {unconvertedCount > 0 && (
            <button
              type="button"
              disabled={converting}
              onClick={() => void handleConvertTasks()}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <ListTodo className="h-3.5 w-3.5" aria-hidden="true" />
              {converting ? "Creating..." : `Create tasks (${unconvertedCount})`}
            </button>
          )}
        </div>

        <div className="space-y-1.5">
          {meta.actionItems.map((item, idx) => (
            <div
              key={`${idx}-${item.text}`}
              className="flex items-center justify-between gap-2 rounded-md border border-border bg-background px-2.5 py-1.5"
            >
              <button
                type="button"
                onClick={() => handleToggleActionItem(idx)}
                className="flex min-h-[44px] flex-1 items-center gap-2 text-left text-sm"
              >
                <CheckSquare
                  className={`h-4 w-4 shrink-0 ${
                    item.done ? "text-primary" : "text-muted-foreground"
                  }`}
                  aria-hidden="true"
                />
                <span className={item.done ? "line-through text-muted-foreground" : "text-foreground"}>
                  {item.text}
                </span>
                {(item.owner || item.due) && (
                  <span className="text-xs text-muted-foreground">
                    {[item.owner ? `@${item.owner}` : "", item.due || ""].filter(Boolean).join(" · ")}
                  </span>
                )}
              </button>

              <div className="flex items-center gap-1 shrink-0">
                {item.taskId ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    <Check className="h-3 w-3 text-primary" aria-hidden="true" />
                    Task
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={converting}
                    onClick={() => void handleConvertTasks([idx])}
                    className="min-h-[44px] rounded-md border border-border px-2.5 text-xs font-medium text-foreground hover:bg-muted"
                  >
                    To Task
                  </button>
                )}
                <button
                  type="button"
                  aria-label="Remove action item"
                  onClick={() => handleRemoveActionItem(idx)}
                  className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Quick-add action item row */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 pt-1">
          <input
            type="text"
            value={newItemText}
            onChange={(e) => setNewItemText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddActionItem();
              }
            }}
            placeholder="New action item..."
            className="sm:col-span-6 min-h-[44px] rounded-md border border-input bg-background px-2.5 text-sm text-foreground"
          />
          <input
            type="text"
            value={newItemOwner}
            onChange={(e) => setNewItemOwner(e.target.value)}
            placeholder="Owner (opt.)"
            className="sm:col-span-2 min-h-[44px] rounded-md border border-input bg-background px-2.5 text-sm text-foreground"
          />
          <input
            type="date"
            value={newItemDue}
            onChange={(e) => setNewItemDue(e.target.value)}
            className="sm:col-span-2 min-h-[44px] rounded-md border border-input bg-background px-2 text-sm text-foreground"
          />
          <button
            type="button"
            onClick={handleAddActionItem}
            disabled={!newItemText.trim()}
            className="sm:col-span-2 inline-flex min-h-[44px] items-center justify-center gap-1 rounded-md bg-secondary px-3 text-xs font-medium text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
