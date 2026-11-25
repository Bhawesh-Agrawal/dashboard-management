"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronDown, ChevronUp, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { CLASSIFICATION_META, HELP_TYPE_LABELS } from "../lib/constants";
import {
  DSA_CLASSIFICATIONS,
  DSA_HELP_TYPES,
  DSA_MISTAKE_TAGS,
  type DsaClassificationValue,
  type DsaHelpTypeValue,
} from "../lib/schemas";
import { createDsaAttempt, updateDsaAttempt } from "../lib/attempt-actions";

export interface AttemptSheetTarget {
  problemId: string;
  problemTitle: string;
  isRevision: boolean;
  editAttempt?: {
    id: string;
    attemptDate: string;
    classification: DsaClassificationValue;
    timeSpentMin: number;
    confidence: number;
    isRevision: boolean;
    helpType: DsaHelpTypeValue;
    initialApproach: string | null;
    finalApproach: string | null;
    mistakes: string | null;
    mistakeTags: string[];
    timeComplexity: string | null;
    spaceComplexity: string | null;
    observation: string | null;
  };
}

interface AttemptLogSheetProps {
  target: AttemptSheetTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate?: string;
  onSaved?: () => void;
}

const TIME_CHIPS = [15, 30, 45, 60, 90] as const;

function makeRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function defaultTodayFallback(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kathmandu",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function AttemptLogSheet({
  target,
  open,
  onOpenChange,
  defaultDate,
  onSaved,
}: AttemptLogSheetProps) {
  const formKey = target
    ? `${target.problemId}-${target.editAttempt?.id ?? "new"}-${open ? "1" : "0"}`
    : "empty";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl max-h-[92vh] overflow-y-auto p-4 sm:p-6"
      >
        {target && (
          <AttemptLogSheetBody
            key={formKey}
            target={target}
            defaultDate={defaultDate ?? defaultTodayFallback()}
            onClose={() => onOpenChange(false)}
            onSaved={onSaved}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function AttemptLogSheetBody({
  target,
  defaultDate,
  onClose,
  onSaved,
}: {
  target: AttemptSheetTarget;
  defaultDate: string;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const edit = target.editAttempt;

  const [classification, setClassification] = useState<DsaClassificationValue>(
    edit?.classification ?? "independent"
  );
  const [timeSpentMin, setTimeSpentMin] = useState<number>(edit?.timeSpentMin ?? 30);
  const [confidence, setConfidence] = useState<number>(edit?.confidence ?? 3);
  const [showMore, setShowMore] = useState<boolean>(Boolean(edit));

  const [attemptDate, setAttemptDate] = useState<string>(edit?.attemptDate ?? defaultDate);
  const [isRevision, setIsRevision] = useState<boolean>(
    edit ? edit.isRevision : target.isRevision
  );
  const [helpType, setHelpType] = useState<DsaHelpTypeValue>(edit?.helpType ?? "none");
  const [initialApproach, setInitialApproach] = useState(edit?.initialApproach ?? "");
  const [finalApproach, setFinalApproach] = useState(edit?.finalApproach ?? "");
  const [mistakeTags, setMistakeTags] = useState<string[]>(edit?.mistakeTags ?? []);
  const [mistakes, setMistakes] = useState(edit?.mistakes ?? "");
  const [timeComplexity, setTimeComplexity] = useState(edit?.timeComplexity ?? "");
  const [spaceComplexity, setSpaceComplexity] = useState(edit?.spaceComplexity ?? "");
  const [observation, setObservation] = useState(edit?.observation ?? "");

  const [clientRequestId] = useState<string>(() => makeRequestId());
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggleMistakeTag(tag: string) {
    setMistakeTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    setSaveError(null);

    if (!Number.isInteger(timeSpentMin) || timeSpentMin < 1) {
      setSaveError("Enter minutes spent (at least 1).");
      return;
    }

    startTransition(async () => {
      try {
        if (edit) {
          await updateDsaAttempt({
            attemptId: edit.id,
            attemptDate,
            classification,
            timeSpentMin,
            confidence,
            isRevision,
            helpType,
            initialApproach,
            finalApproach,
            mistakes,
            mistakeTags,
            timeComplexity,
            spaceComplexity,
            observation,
          });
          toast.success("Attempt updated");
        } else {
          await createDsaAttempt({
            problemId: target.problemId,
            attemptDate,
            classification,
            timeSpentMin,
            confidence,
            isRevision,
            helpType,
            initialApproach,
            finalApproach,
            mistakes,
            mistakeTags,
            timeComplexity,
            spaceComplexity,
            observation,
            clientRequestId,
          });
          toast.success(`Logged: ${CLASSIFICATION_META[classification].shortLabel}`);
        }
        router.refresh();
        onSaved?.();
        onClose();
      } catch {
        setSaveError("Not saved, tap to retry");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-xl mx-auto">
      <SheetHeader className="p-0">
        <SheetTitle className="text-base pr-8">
          {edit ? "Edit Attempt" : "Log Attempt"} — {target.problemTitle}
        </SheetTitle>
      </SheetHeader>

      {saveError && (
        <button
          type="button"
          onClick={() => handleSubmit()}
          disabled={isPending}
          className="w-full min-h-[44px] flex items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive text-left"
        >
          <span className="flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {saveError}
          </span>
          <span className="inline-flex items-center gap-1 underline">
            <RotateCcw className="h-3.5 w-3.5" />
            Retry
          </span>
        </button>
      )}

      {/* 5 Large Classification Buttons */}
      <div className="space-y-1.5">
        <div className="section-label">How did it go?</div>
        <div className="grid grid-cols-1 gap-2">
          {DSA_CLASSIFICATIONS.map((cls) => {
            const meta = CLASSIFICATION_META[cls];
            const selected = classification === cls;
            return (
              <button
                key={cls}
                type="button"
                onClick={() => setClassification(cls)}
                className={`min-h-[48px] w-full rounded-xl border px-3.5 py-2.5 text-left transition-all ${
                  selected
                    ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                    : "border-border bg-card hover:bg-muted/50"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{meta.label}</span>
                  <span className="text-[11px] font-mono text-muted-foreground">
                    +{meta.intervalLabel}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{meta.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Time Spent */}
      <div className="space-y-1.5">
        <div className="section-label">Time spent (minutes)</div>
        <div className="flex flex-wrap items-center gap-1.5">
          {TIME_CHIPS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setTimeSpentMin(m)}
              className={`min-h-[44px] min-w-[48px] rounded-lg border px-3 text-xs font-medium transition-colors ${
                timeSpentMin === m
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-border hover:bg-muted"
              }`}
            >
              {m}m
            </button>
          ))}
          <input
            type="number"
            min={1}
            max={1440}
            aria-label="Custom minutes"
            value={timeSpentMin}
            onChange={(e) => setTimeSpentMin(Number(e.target.value) || 0)}
            className="min-h-[44px] w-20 rounded-lg border border-input bg-background px-2.5 text-xs font-mono"
          />
        </div>
      </div>

      {/* Confidence 1-5 */}
      <div className="space-y-1.5">
        <div className="section-label">Confidence (1 = shaky, 5 = solid)</div>
        <div className="grid grid-cols-5 gap-2">
          {[1, 2, 3, 4, 5].map((val) => (
            <button
              key={val}
              type="button"
              onClick={() => setConfidence(val)}
              className={`min-h-[44px] rounded-lg border text-sm font-semibold transition-colors ${
                confidence === val
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-border hover:bg-muted"
              }`}
            >
              {val}
            </button>
          ))}
        </div>
      </div>

      {/* Primary Save Button */}
      <Button
        type="submit"
        disabled={isPending}
        className="w-full min-h-[48px] text-sm font-semibold"
      >
        {isPending ? "Saving..." : edit ? "Update Attempt" : "Save Attempt"}
      </Button>

      {/* Collapsible More Details */}
      <div className="border-t border-border pt-3">
        <button
          type="button"
          onClick={() => setShowMore((prev) => !prev)}
          className="w-full min-h-[44px] flex items-center justify-between text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <span>More details (optional)</span>
          {showMore ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        {showMore && (
          <div className="pt-3 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="section-label block mb-1">Attempt Date</label>
                <input
                  type="date"
                  value={attemptDate}
                  onChange={(e) => setAttemptDate(e.target.value)}
                  className="w-full min-h-[44px] rounded-lg border border-input bg-background px-3 text-xs"
                />
              </div>
              <div>
                <label className="section-label block mb-1">Help Type</label>
                <select
                  value={helpType}
                  onChange={(e) => setHelpType(e.target.value as DsaHelpTypeValue)}
                  className="w-full min-h-[44px] rounded-lg border border-input bg-background px-3 text-xs"
                >
                  {DSA_HELP_TYPES.map((h) => (
                    <option key={h} value={h}>
                      {HELP_TYPE_LABELS[h]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <label className="flex items-center gap-2 min-h-[44px] text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={isRevision}
                onChange={(e) => setIsRevision(e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              Mark as revision attempt
            </label>

            <div>
              <div className="section-label mb-1.5">Mistake Tags</div>
              <div className="flex flex-wrap gap-1.5">
                {DSA_MISTAKE_TAGS.map((tag) => {
                  const active = mistakeTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleMistakeTag(tag)}
                      className={`min-h-[36px] rounded-md border px-2.5 py-1 text-xs transition-colors ${
                        active
                          ? "border-destructive bg-destructive/15 text-destructive font-medium"
                          : "border-border bg-background text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="section-label block mb-1">Mistakes</label>
              <textarea
                rows={2}
                value={mistakes}
                onChange={(e) => setMistakes(e.target.value)}
                placeholder="What went wrong or slowed you down?"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="section-label block mb-1">Initial Approach</label>
                <textarea
                  rows={2}
                  value={initialApproach}
                  onChange={(e) => setInitialApproach(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="section-label block mb-1">Final Approach</label>
                <textarea
                  rows={2}
                  value={finalApproach}
                  onChange={(e) => setFinalApproach(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="section-label block mb-1">Time Complexity</label>
                <input
                  type="text"
                  value={timeComplexity}
                  onChange={(e) => setTimeComplexity(e.target.value)}
                  placeholder="O(n log n)"
                  className="w-full min-h-[44px] rounded-lg border border-input bg-background px-3 text-xs font-mono"
                />
              </div>
              <div>
                <label className="section-label block mb-1">Space Complexity</label>
                <input
                  type="text"
                  value={spaceComplexity}
                  onChange={(e) => setSpaceComplexity(e.target.value)}
                  placeholder="O(n)"
                  className="w-full min-h-[44px] rounded-lg border border-input bg-background px-3 text-xs font-mono"
                />
              </div>
            </div>

            <div>
              <label className="section-label block mb-1">Observation</label>
              <textarea
                rows={2}
                value={observation}
                onChange={(e) => setObservation(e.target.value)}
                placeholder="Key takeaway for next revision..."
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs"
              />
            </div>
          </div>
        )}
      </div>
    </form>
  );
}
