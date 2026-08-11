"use client";

import { useState, useEffect } from "react";
import { useCreateEvent } from "@/lib/sync/hooks";
import { X, CalendarDays, Clock, MapPin, Repeat, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

interface EventFormData {
  title: string;
  dateTime: string;
  endTime: string;
  location: string;
  notes: string;
  recurrence: "none" | "weekly" | "biweekly" | "monthly" | "custom";
  customRecurrence: string;
  recurrenceEnd: string;
}

interface EventCreationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDate?: Date;
}

const RECURRENCE_OPTIONS = [
  { value: "none", label: "No repeat" },
  { value: "weekly", label: "Every week" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "monthly", label: "Every month" },
  { value: "custom", label: "Custom..." },
];

const DAYS_OF_WEEK = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

export function EventCreationDialog({
  open,
  onOpenChange,
  selectedDate,
}: EventCreationDialogProps) {
  const createEvent = useCreateEvent();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<EventFormData>({
    title: "",
    dateTime: "",
    endTime: "",
    location: "",
    notes: "",
    recurrence: "none",
    customRecurrence: "FREQ=WEEKLY;BYDAY=MO",
    recurrenceEnd: "",
  });

  // Set default date/time when dialog opens
  useEffect(() => {
    if (open) {
      const now = selectedDate || new Date();
      const dateStr = now.toISOString().slice(0, 10);
      const timeStr = "09:00";
      const endTimeStr = "10:00";
      setFormData(prev => ({
        ...prev,
        dateTime: `${dateStr}T${timeStr}`,
        endTime: `${dateStr}T${endTimeStr}`,
      }));
    }
  }, [open, selectedDate]);

  function buildRRule(): string | null {
    if (formData.recurrence === "none") return null;
    
    if (formData.recurrence === "custom") {
      return formData.customRecurrence || null;
    }

    const startDate = new Date(formData.dateTime);
    const byDay = DAYS_OF_WEEK[startDate.getDay()];

    switch (formData.recurrence) {
      case "weekly":
        return `FREQ=WEEKLY;BYDAY=${byDay}`;
      case "biweekly":
        return `FREQ=WEEKLY;INTERVAL=2;BYDAY=${byDay}`;
      case "monthly":
        return `FREQ=MONTHLY;BYMONTHDAY=${startDate.getDate()}`;
      default:
        return null;
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.title.trim() || !formData.dateTime) return;

    setLoading(true);
    try {
      const recurrenceRule = buildRRule();
      const recurrenceEnd = formData.recurrenceEnd
        ? new Date(formData.recurrenceEnd).toISOString()
        : null;

      await createEvent({
        title: formData.title.trim(),
        dateTime: new Date(formData.dateTime).toISOString(),
        endTime: formData.endTime ? new Date(formData.endTime).toISOString() : undefined,
        location: formData.location.trim() || undefined,
        notes: formData.notes.trim() || undefined,
        recurrenceRule: recurrenceRule || undefined,
        recurrenceEnd: recurrenceEnd || undefined,
      });

      onOpenChange(false);
      setFormData({
        title: "",
        dateTime: "",
        endTime: "",
        location: "",
        notes: "",
        recurrence: "none",
        customRecurrence: "FREQ=WEEKLY;BYDAY=MO",
        recurrenceEnd: "",
      });
    } catch (error) {
      console.error("Failed to create event:", error);
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={() => onOpenChange(false)}
    >
      <div
        className={cn(
          "w-full max-w-md rounded-2xl border bg-card shadow-2xl",
          "animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            <h2 className="font-serif text-lg font-bold">New Event</h2>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="p-1.5 rounded-md hover:bg-accent transition-colors"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Title */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Event Title
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
              placeholder="e.g., Team meeting"
              className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm"
              autoFocus
            />
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                <Calendar className="h-3 w-3 inline mr-1" />
                Start
              </label>
              <input
                type="datetime-local"
                value={formData.dateTime}
                onChange={(e) => setFormData(prev => ({ ...prev, dateTime: e.target.value }))}
                className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                <Clock className="h-3 w-3 inline mr-1" />
                End
              </label>
              <input
                type="datetime-local"
                value={formData.endTime}
                onChange={(e) => setFormData(prev => ({ ...prev, endTime: e.target.value }))}
                className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm"
              />
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              <MapPin className="h-3 w-3 inline mr-1" />
              Location (optional)
            </label>
            <input
              type="text"
              value={formData.location}
              onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
              placeholder="e.g., Room 101"
              className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Notes (optional)
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Add any additional details..."
              rows={2}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none"
            />
          </div>

          {/* Recurrence */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              <Repeat className="h-3 w-3 inline mr-1" />
              Repeat
            </label>
            <select
              value={formData.recurrence}
              onChange={(e) => setFormData(prev => ({ ...prev, recurrence: e.target.value as EventFormData["recurrence"] }))}
              className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm"
            >
              {RECURRENCE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>

            {/* Custom recurrence input */}
            {formData.recurrence === "custom" && (
              <input
                type="text"
                value={formData.customRecurrence}
                onChange={(e) => setFormData(prev => ({ ...prev, customRecurrence: e.target.value }))}
                placeholder="e.g., FREQ=WEEKLY;BYDAY=MO,WE,FR"
                className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm mt-2"
              />
            )}

            {/* Recurrence end date */}
            {formData.recurrence !== "none" && (
              <div className="mt-2">
                <label className="text-xs text-muted-foreground mb-1 block">
                  Repeat until (optional)
                </label>
                <input
                  type="date"
                  value={formData.recurrenceEnd}
                  onChange={(e) => setFormData(prev => ({ ...prev, recurrenceEnd: e.target.value }))}
                  className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm"
                />
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex-1 h-10 rounded-lg border border-input text-sm font-medium hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !formData.title.trim() || !formData.dateTime}
              className="flex-1 h-10 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {loading ? "Creating..." : "Create Event"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
