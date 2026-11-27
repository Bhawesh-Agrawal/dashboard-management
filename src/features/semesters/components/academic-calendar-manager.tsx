"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, FileUp, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import {
  bulkCreateAcademicCalendarEntries,
  createAcademicCalendarEntry,
  deleteAcademicCalendarEntry,
  updateAcademicCalendarEntry,
} from "../lib/calendar-actions";
import {
  ACADEMIC_CALENDAR_KINDS,
  defaultCancelsClassesForKind,
  type AcademicCalendarKindValue,
} from "../lib/calendar-types";
import {
  parseCalendarTextDeterministic,
  parseIcsAllDayEvents,
  type ParsedCalendarEntry,
} from "../lib/calendar-import";
import { parseCalendarTextWithAiAction } from "../lib/calendar-ai-actions";

export interface CalendarEntryDTO {
  id: string;
  kind: AcademicCalendarKindValue;
  title: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  cancelsClasses: boolean;
  followsWeekday: number | null;
  notes: string | null;
}

const KIND_LABELS: Record<AcademicCalendarKindValue, string> = {
  holiday: "Holiday",
  break: "Break",
  exam_period: "Exam period",
  no_classes: "No classes",
  follows_weekday: "Follows weekday",
  note: "Note",
};

const WEEKDAY_OPTIONS = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 7, label: "Sunday" },
];

export function AcademicCalendarManager({
  semesterId,
  defaultYear,
  initialEntries,
  onChanged,
  extraHeaderAction,
}: {
  semesterId: string;
  defaultYear: number;
  initialEntries: CalendarEntryDTO[];
  onChanged?: () => void;
  extraHeaderAction?: React.ReactNode;
}) {
  const router = useRouter();
  const [entries, setEntries] = useState<CalendarEntryDTO[]>(initialEntries);
  const [isPending, startTransition] = useTransition();

  // Single add/edit form
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [kind, setKind] = useState<AcademicCalendarKindValue>("holiday");
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [cancelsClasses, setCancelsClasses] = useState(true);
  const [followsWeekday, setFollowsWeekday] = useState<number>(1);
  const [notes, setNotes] = useState("");

  // Import & review state
  const [importMode, setImportMode] = useState<"none" | "text" | "ics">("none");
  const [pasteText, setPasteText] = useState("");
  const [reviewRows, setReviewRows] = useState<ParsedCalendarEntry[]>([]);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);

  const groupedByMonth = useMemo(() => {
    const groups = new Map<string, CalendarEntryDTO[]>();
    const sorted = [...entries].sort((a, b) => a.startDate.localeCompare(b.startDate));
    for (const item of sorted) {
      const monthKey = item.startDate.slice(0, 7);
      const list = groups.get(monthKey) ?? [];
      list.push(item);
      groups.set(monthKey, list);
    }
    return Array.from(groups.entries()).map(([monthKey, items]) => {
      const [y, m] = monthKey.split("-").map(Number);
      const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      });
      return { monthKey, label, items };
    });
  }, [entries]);

  function openNewForm() {
    setEditingId(null);
    setKind("holiday");
    setTitle("");
    setStartDate("");
    setEndDate("");
    setCancelsClasses(true);
    setFollowsWeekday(1);
    setNotes("");
    setFormOpen(true);
  }

  function openEditForm(item: CalendarEntryDTO) {
    setEditingId(item.id);
    setKind(item.kind);
    setTitle(item.title);
    setStartDate(item.startDate);
    setEndDate(item.endDate);
    setCancelsClasses(item.cancelsClasses);
    setFollowsWeekday(item.followsWeekday ?? 1);
    setNotes(item.notes ?? "");
    setFormOpen(true);
  }

  function handleKindChange(nextKind: AcademicCalendarKindValue) {
    setKind(nextKind);
    setCancelsClasses(defaultCancelsClassesForKind(nextKind));
  }

  function handleSaveSingle(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !startDate) return;
    const resolvedEnd = endDate && endDate >= startDate ? endDate : startDate;

    startTransition(async () => {
      try {
        if (editingId) {
          const updated = await updateAcademicCalendarEntry(editingId, {
            kind,
            title: title.trim(),
            startDate,
            endDate: resolvedEnd,
            cancelsClasses,
            followsWeekday: kind === "follows_weekday" ? followsWeekday : null,
            notes: notes.trim() || null,
          });
          setEntries((prev) =>
            prev.map((row) =>
              row.id === editingId
                ? {
                    id: updated.id,
                    kind: updated.kind,
                    title: updated.title,
                    startDate: updated.startDate.toISOString().slice(0, 10),
                    endDate: updated.endDate.toISOString().slice(0, 10),
                    cancelsClasses: updated.cancelsClasses,
                    followsWeekday: updated.followsWeekday,
                    notes: updated.notes,
                  }
                : row
            )
          );
          toast.success("Calendar entry updated");
        } else {
          const created = await createAcademicCalendarEntry({
            semesterId,
            kind,
            title: title.trim(),
            startDate,
            endDate: resolvedEnd,
            cancelsClasses,
            followsWeekday: kind === "follows_weekday" ? followsWeekday : null,
            notes: notes.trim() || null,
          });
          setEntries((prev) => [
            ...prev,
            {
              id: created.id,
              kind: created.kind,
              title: created.title,
              startDate: created.startDate.toISOString().slice(0, 10),
              endDate: created.endDate.toISOString().slice(0, 10),
              cancelsClasses: created.cancelsClasses,
              followsWeekday: created.followsWeekday,
              notes: created.notes,
            },
          ]);
          toast.success("Calendar entry added");
        }
        setFormOpen(false);
        onChanged?.();
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to save entry");
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      try {
        await deleteAcademicCalendarEntry(id);
        setEntries((prev) => prev.filter((e) => e.id !== id));
        toast.success("Entry removed");
        onChanged?.();
        router.refresh();
      } catch {
        toast.error("Failed to remove entry");
      }
    });
  }

  function handleParseTextDeterministic() {
    const res = parseCalendarTextDeterministic(pasteText, defaultYear);
    setReviewRows(res.entries);
    setParseWarnings(res.warnings);
  }

  function handleParseTextWithAi() {
    startTransition(async () => {
      try {
        const res = await parseCalendarTextWithAiAction(semesterId, pasteText);
        setReviewRows(res.entries);
        setParseWarnings(res.warnings);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "AI parsing failed");
      }
    });
  }

  async function handleIcsFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const res = parseIcsAllDayEvents(text);
    setReviewRows(res.entries);
    setParseWarnings(res.warnings);
  }

  function updateReviewRow(id: string, patch: Partial<ParsedCalendarEntry>) {
    setReviewRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function handleConfirmReview() {
    if (reviewRows.length === 0) return;
    startTransition(async () => {
      try {
        const res = await bulkCreateAcademicCalendarEntries(
          semesterId,
          reviewRows.map((r) => ({
            kind: r.kind,
            title: r.title,
            startDate: r.startDate,
            endDate: r.endDate,
            cancelsClasses: r.cancelsClasses,
            followsWeekday: r.kind === "follows_weekday" ? r.followsWeekday ?? 1 : null,
            notes: r.notes ?? null,
          }))
        );
        toast.success(`Added ${res.created} calendar entries`);
        setReviewRows([]);
        setParseWarnings([]);
        setPasteText("");
        setImportMode("none");
        onChanged?.();
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to save entries");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={openNewForm} className="min-h-[44px]">
            <Plus className="h-4 w-4 mr-1.5" />
            Add entry
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setImportMode(importMode === "text" ? "none" : "text")}
            className="min-h-[44px]"
          >
            <CalendarPlus className="h-4 w-4 mr-1.5" />
            Paste text / AI
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setImportMode(importMode === "ics" ? "none" : "ics")}
            className="min-h-[44px]"
          >
            <FileUp className="h-4 w-4 mr-1.5" />
            Import .ics
          </Button>
        </div>
        {extraHeaderAction}
      </div>

      {/* Single Entry Add/Edit Form */}
      {formOpen && (
        <form
          onSubmit={handleSaveSingle}
          className="rounded-xl border border-border bg-card p-4 space-y-4"
        >
          <h3 className="text-sm font-semibold text-foreground">
            {editingId ? "Edit calendar entry" : "New calendar entry"}
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="space-y-1 text-xs text-muted-foreground">
              <span>Title</span>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Republic Day, Mid-Sem Exams"
                className="w-full min-h-[44px] rounded-md border border-border bg-background px-3 text-sm text-foreground"
              />
            </label>

            <label className="space-y-1 text-xs text-muted-foreground">
              <span>Kind</span>
              <select
                value={kind}
                onChange={(e) =>
                  handleKindChange(e.target.value as AcademicCalendarKindValue)
                }
                className="w-full min-h-[44px] rounded-md border border-border bg-background px-3 text-sm text-foreground"
              >
                {ACADEMIC_CALENDAR_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="space-y-1 text-xs text-muted-foreground">
              <span>Start date</span>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (!endDate || endDate < e.target.value) {
                    setEndDate(e.target.value);
                  }
                }}
                className="w-full min-h-[44px] rounded-md border border-border bg-background px-3 text-sm text-foreground"
              />
            </label>

            <label className="space-y-1 text-xs text-muted-foreground">
              <span>End date (inclusive)</span>
              <input
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full min-h-[44px] rounded-md border border-border bg-background px-3 text-sm text-foreground"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-xs text-foreground min-h-[44px] cursor-pointer">
              <input
                type="checkbox"
                checked={cancelsClasses}
                onChange={(e) => setCancelsClasses(e.target.checked)}
                className="h-4 w-4"
              />
              <span>Cancels classes on these dates</span>
            </label>

            {kind === "follows_weekday" && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Follows weekday:</span>
                <select
                  value={followsWeekday}
                  onChange={(e) => setFollowsWeekday(Number(e.target.value))}
                  className="min-h-[44px] rounded-md border border-border bg-background px-2.5 text-sm text-foreground"
                >
                  {WEEKDAY_OPTIONS.map((w) => (
                    <option key={w.value} value={w.value}>
                      {w.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button type="submit" disabled={isPending} className="min-h-[44px]">
              {isPending ? "Saving..." : editingId ? "Update entry" : "Save entry"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setFormOpen(false)}
              className="min-h-[44px]"
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {/* Paste Text / AI Import */}
      {importMode === "text" && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">
            Paste Academic Calendar Text
          </h3>
          <p className="text-xs text-muted-foreground">
            Paste lines like &ldquo;26 Jan 2027 – Republic Day&rdquo;, &ldquo;10-15 Mar: Mid-semester exams&rdquo;, or &ldquo;Sat 13 Feb follows Monday timetable&rdquo;. Nothing is saved until you confirm.
          </p>
          <textarea
            rows={5}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="26 Jan 2027 – Republic Day&#10;10-15 Mar: Mid-semester exams&#10;Sat 13 Feb follows Monday timetable"
            className="w-full rounded-md border border-border bg-background p-3 text-sm text-foreground"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={handleParseTextDeterministic}
              disabled={!pasteText.trim() || isPending}
              className="min-h-[44px]"
            >
              Parse text
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleParseTextWithAi}
              disabled={!pasteText.trim() || isPending}
              className="min-h-[44px]"
            >
              <Sparkles className="h-4 w-4 mr-1.5" />
              Parse with AI
            </Button>
          </div>
        </div>
      )}

      {/* ICS Import */}
      {importMode === "ics" && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Import .ics File</h3>
          <p className="text-xs text-muted-foreground">
            Select an iCalendar (.ics) file with all-day holiday or exam events to review before saving.
          </p>
          <input
            type="file"
            accept=".ics,text/calendar"
            onChange={handleIcsFile}
            className="block w-full text-xs text-foreground file:mr-3 file:min-h-[44px] file:rounded-md file:border file:border-border file:bg-background file:px-3 file:text-xs file:font-medium"
          />
        </div>
      )}

      {/* Parse Warnings + Review Table */}
      {(parseWarnings.length > 0 || reviewRows.length > 0) && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-foreground">
              Review Parsed Entries ({reviewRows.length})
            </h3>
            {reviewRows.length > 0 && (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setReviewRows([]);
                    setParseWarnings([]);
                  }}
                  className="min-h-[44px]"
                >
                  Discard
                </Button>
                <Button
                  type="button"
                  disabled={isPending}
                  onClick={handleConfirmReview}
                  className="min-h-[44px]"
                >
                  {isPending ? "Saving..." : "Confirm & Save"}
                </Button>
              </div>
            )}
          </div>

          {parseWarnings.length > 0 && (
            <ul className="space-y-1 text-xs text-destructive">
              {parseWarnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}

          {reviewRows.length > 0 && (
            <div className="space-y-2">
              {reviewRows.map((row) => (
                <div
                  key={row.id}
                  className="rounded-lg border border-border bg-background p-3 space-y-2"
                >
                  {row.lowConfidence && (
                    <p className="text-xs text-destructive font-medium">
                      Check this row (low confidence)
                    </p>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                    <input
                      type="text"
                      value={row.title}
                      onChange={(e) => updateReviewRow(row.id, { title: e.target.value })}
                      className="min-h-[44px] rounded border border-border bg-card px-2.5 text-xs text-foreground sm:col-span-2"
                    />
                    <input
                      type="date"
                      value={row.startDate}
                      onChange={(e) =>
                        updateReviewRow(row.id, { startDate: e.target.value })
                      }
                      className="min-h-[44px] rounded border border-border bg-card px-2.5 text-xs text-foreground"
                    />
                    <input
                      type="date"
                      value={row.endDate}
                      onChange={(e) => updateReviewRow(row.id, { endDate: e.target.value })}
                      className="min-h-[44px] rounded border border-border bg-card px-2.5 text-xs text-foreground"
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex flex-wrap items-center gap-3">
                      <select
                        value={row.kind}
                        onChange={(e) => {
                          const k = e.target.value as AcademicCalendarKindValue;
                          updateReviewRow(row.id, {
                            kind: k,
                            cancelsClasses: defaultCancelsClassesForKind(k),
                          });
                        }}
                        className="min-h-[44px] rounded border border-border bg-card px-2 text-xs text-foreground"
                      >
                        {ACADEMIC_CALENDAR_KINDS.map((k) => (
                          <option key={k} value={k}>
                            {KIND_LABELS[k]}
                          </option>
                        ))}
                      </select>
                      <label className="flex items-center gap-1.5 min-h-[44px] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={row.cancelsClasses}
                          onChange={(e) =>
                            updateReviewRow(row.id, { cancelsClasses: e.target.checked })
                          }
                        />
                        <span>Cancels classes</span>
                      </label>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setReviewRows((prev) => prev.filter((r) => r.id !== row.id))
                      }
                      className="text-xs text-destructive hover:underline min-h-[44px] px-2"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Existing Entries Grouped by Month */}
      {groupedByMonth.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-6">
          <EmptyState
            title="No academic calendar entries yet"
            description="Add holidays, breaks, exam periods, or day-order swaps so attendance and reminders stay accurate."
          />
        </div>
      ) : (
        <div className="space-y-5">
          {groupedByMonth.map((group) => (
            <div key={group.monthKey} className="space-y-2">
              <h3 className="section-label">{group.label}</h3>
              <ul className="divide-y divide-border rounded-xl border border-border bg-card overflow-hidden">
                {group.items.map((item) => {
                  const dateLabel =
                    item.startDate === item.endDate
                      ? item.startDate
                      : `${item.startDate} to ${item.endDate}`;
                  const followsLabel =
                    item.kind === "follows_weekday" && item.followsWeekday
                      ? ` · Follows ${
                          WEEKDAY_OPTIONS.find((w) => w.value === item.followsWeekday)
                            ?.label ?? ""
                        }`
                      : "";
                  return (
                    <li
                      key={item.id}
                      className="flex items-center justify-between gap-3 p-3.5"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {item.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {dateLabel} · {KIND_LABELS[item.kind]}
                          {followsLabel}
                          {item.cancelsClasses ? " · Cancels classes" : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => openEditForm(item)}
                          aria-label={`Edit ${item.title}`}
                          className="p-2 text-muted-foreground hover:text-foreground min-h-[44px] min-w-[44px] inline-flex items-center justify-center"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(item.id)}
                          aria-label={`Delete ${item.title}`}
                          disabled={isPending}
                          className="p-2 text-muted-foreground hover:text-destructive min-h-[44px] min-w-[44px] inline-flex items-center justify-center"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
