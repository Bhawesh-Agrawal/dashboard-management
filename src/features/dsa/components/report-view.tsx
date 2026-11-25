"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Copy, Download, FileCode, FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  buildTutorReportData,
  formatTutorReportJson,
  formatTutorReportMarkdown,
  isReportOverSizeThreshold,
  TUTOR_REPORT_CHAR_WARN_THRESHOLD,
  type TutorReportSourceInput,
} from "../lib/report";

export function TutorReportView({ source }: { source: TutorReportSourceInput }) {
  const latestSession = source.sessions[0];

  const [windowDays, setWindowDays] = useState<7 | 14 | 30>(14);
  const [includeFullHistory, setIncludeFullHistory] = useState<boolean>(true);
  const [nextSessionMinutes, setNextSessionMinutes] = useState<string>(
    latestSession?.nextSessionAvailabilityMin != null
      ? String(latestSession.nextSessionAvailabilityMin)
      : ""
  );
  const [tutorNote, setTutorNote] = useState<string>(
    latestSession?.nextSessionNote ?? ""
  );
  const [previewTab, setPreviewTab] = useState<"markdown" | "json">("markdown");

  const reportData = useMemo(
    () =>
      buildTutorReportData(source, {
        windowDays,
        includeFullHistory,
        nextSessionMinutes:
          nextSessionMinutes.trim() === "" ? null : Number(nextSessionMinutes),
        tutorNote,
      }),
    [source, windowDays, includeFullHistory, nextSessionMinutes, tutorNote]
  );

  const markdown = useMemo(() => formatTutorReportMarkdown(reportData), [reportData]);
  const jsonText = useMemo(() => formatTutorReportJson(reportData), [reportData]);
  const activeText = previewTab === "markdown" ? markdown : jsonText;
  const overThreshold = isReportOverSizeThreshold(markdown);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(markdown);
      toast.success("Markdown report copied to clipboard");
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  }

  function downloadFile(content: string, filename: string, mime: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      {/* Options */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <div className="section-label mb-1.5">Session Window</div>
            <div className="grid grid-cols-3 gap-2">
              {([7, 14, 30] as const).map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => setWindowDays(days)}
                  className={`min-h-[44px] rounded-lg border text-xs font-medium transition-colors ${
                    windowDays === days
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-border hover:bg-muted"
                  }`}
                >
                  {days} days
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="section-label mb-1.5">Attempt History Mode</div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setIncludeFullHistory(true)}
                className={`min-h-[44px] rounded-lg border px-2 text-xs font-medium transition-colors ${
                  includeFullHistory
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border hover:bg-muted"
                }`}
              >
                Full history
              </button>
              <button
                type="button"
                onClick={() => setIncludeFullHistory(false)}
                className={`min-h-[44px] rounded-lg border px-2 text-xs font-medium transition-colors ${
                  !includeFullHistory
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border hover:bg-muted"
                }`}
              >
                Latest only
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="section-label block mb-1">
              Available Time for Next Session (min)
            </label>
            <input
              type="number"
              min={0}
              max={1440}
              placeholder="e.g. 60"
              value={nextSessionMinutes}
              onChange={(e) => setNextSessionMinutes(e.target.value)}
              className="w-full min-h-[44px] rounded-lg border border-input bg-background px-3 text-xs font-mono"
            />
          </div>
          <div>
            <label className="section-label block mb-1">Optional Note for Tutor</label>
            <input
              type="text"
              placeholder="Focus areas, upcoming test, constraints..."
              value={tutorNote}
              onChange={(e) => setTutorNote(e.target.value)}
              className="w-full min-h-[44px] rounded-lg border border-input bg-background px-3 text-xs"
            />
          </div>
        </div>

        {/* Export Actions */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button type="button" onClick={handleCopy} className="min-h-[44px] text-xs">
            <Copy className="h-4 w-4 mr-1.5" />
            Copy Markdown
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              downloadFile(
                markdown,
                `dsa-report-${source.todayStr}.md`,
                "text/markdown;charset=utf-8"
              )
            }
            className="min-h-[44px] text-xs"
          >
            <Download className="h-4 w-4 mr-1.5" />
            Download .md
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              downloadFile(
                jsonText,
                `dsa-report-${source.todayStr}.json`,
                "application/json;charset=utf-8"
              )
            }
            className="min-h-[44px] text-xs"
          >
            <Download className="h-4 w-4 mr-1.5" />
            Download .json
          </Button>
          <span className="ml-auto text-xs font-mono text-muted-foreground">
            {markdown.length.toLocaleString()} chars (.md) / {jsonText.length.toLocaleString()} chars (.json)
          </span>
        </div>

        {overThreshold && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 flex items-center gap-2 text-xs text-amber-800 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              Markdown report exceeds {TUTOR_REPORT_CHAR_WARN_THRESHOLD.toLocaleString()} characters ({markdown.length.toLocaleString()}). Consider a 7-day window or &ldquo;Latest only&rdquo; mode for smaller prompt context.
            </span>
          </div>
        )}
      </div>

      {/* Preview Tabs */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPreviewTab("markdown")}
            className={`min-h-[44px] rounded-lg border px-3 text-xs font-medium inline-flex items-center gap-1.5 ${
              previewTab === "markdown"
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background border-border hover:bg-muted"
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
            Markdown Preview
          </button>
          <button
            type="button"
            onClick={() => setPreviewTab("json")}
            className={`min-h-[44px] rounded-lg border px-3 text-xs font-medium inline-flex items-center gap-1.5 ${
              previewTab === "json"
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background border-border hover:bg-muted"
            }`}
          >
            <FileCode className="h-3.5 w-3.5" />
            JSON Preview
          </button>
        </div>

        <pre className="rounded-lg border border-border bg-muted/40 p-3 text-xs font-mono whitespace-pre-wrap break-words max-h-[60vh] overflow-y-auto">
          {activeText}
        </pre>
      </div>
    </div>
  );
}
