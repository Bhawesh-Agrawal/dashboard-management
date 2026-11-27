"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, CheckSquare, Plus, Square, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { ChecklistItem } from "../lib/capture-types";
import { formatChecklistMarkdown } from "../lib/meeting-format";
import { updateCaptureNote } from "../lib/capture-actions";

export interface StepsChecklistEditorProps {
  noteId: string;
  initialItems: ChecklistItem[];
  onUpdated?: () => void;
}

export function StepsChecklistEditor({
  noteId,
  initialItems,
  onUpdated,
}: StepsChecklistEditorProps) {
  const [items, setItems] = useState<ChecklistItem[]>(initialItems);
  const [newStep, setNewStep] = useState("");

  async function persist(nextItems: ChecklistItem[]) {
    setItems(nextItems);
    const res = await updateCaptureNote(noteId, {
      content: formatChecklistMarkdown(nextItems) || "Steps",
      meta: { items: nextItems },
    });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    onUpdated?.();
  }

  function handleToggle(index: number) {
    void persist(
      items.map((item, i) => (i === index ? { ...item, done: !item.done } : item))
    );
  }

  function handleRemove(index: number) {
    void persist(items.filter((_, i) => i !== index));
  }

  function handleMove(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    void persist(next);
  }

  function handleAdd() {
    const trimmed = newStep.trim();
    if (!trimmed) return;
    setNewStep("");
    void persist([...items, { text: trimmed, done: false }]);
  }

  return (
    <div className="space-y-2">
      <div className="space-y-1.5">
        {items.map((item, idx) => (
          <div
            key={`${idx}-${item.text}`}
            className="flex items-center justify-between gap-1 rounded-lg border border-border bg-background px-2.5 py-1"
          >
            <button
              type="button"
              onClick={() => handleToggle(idx)}
              className="flex min-h-[44px] flex-1 items-center gap-2.5 text-left text-sm"
            >
              {item.done ? (
                <CheckSquare className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              ) : (
                <Square className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              )}
              <span className={item.done ? "line-through text-muted-foreground" : "text-foreground"}>
                {item.text}
              </span>
            </button>
            <div className="flex items-center shrink-0">
              <button
                type="button"
                aria-label="Move step up"
                disabled={idx === 0}
                onClick={() => handleMove(idx, -1)}
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-muted-foreground hover:text-foreground disabled:opacity-30"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Move step down"
                disabled={idx === items.length - 1}
                onClick={() => handleMove(idx, 1)}
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-muted-foreground hover:text-foreground disabled:opacity-30"
              >
                <ArrowDown className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Remove step"
                onClick={() => handleRemove(idx)}
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={newStep}
          onChange={(e) => setNewStep(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder="Add a step..."
          className="flex-1 min-h-[44px] rounded-lg border border-input bg-background px-3 text-sm text-foreground"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={!newStep.trim()}
          className="inline-flex min-h-[44px] items-center gap-1 rounded-lg bg-secondary px-3 text-xs font-medium text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Add
        </button>
      </div>
    </div>
  );
}
