"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Download, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  validateBackupPayload,
  type BackupPreviewCounts,
  type DsaBackupPayload,
} from "../lib/backup-schema";
import { exportDsaBackup, restoreDsaBackup } from "../lib/backup-actions";

function triggerJsonDownload(payload: DsaBackupPayload, filename: string) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function DsaBackupCard({ lastBackupAt }: { lastBackupAt: string | null }) {
  const router = useRouter();
  const [parsedPayload, setParsedPayload] = useState<DsaBackupPayload | null>(null);
  const [previewCounts, setPreviewCounts] = useState<BackupPreviewCounts | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [confirmText, setConfirmText] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleExport() {
    startTransition(async () => {
      try {
        const res = await exportDsaBackup();
        const dateTag = res.backup.exportedAt.slice(0, 10);
        triggerJsonDownload(res.backup, `dsa-backup-${dateTag}.json`);
        toast.success("DSA backup exported");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Export failed");
      }
    });
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError(null);
    setParsedPayload(null);
    setPreviewCounts(null);
    try {
      const text = await file.text();
      const raw = JSON.parse(text);
      const check = validateBackupPayload(raw);
      if (!check.ok) {
        setParseError(check.error);
        return;
      }
      setParsedPayload(check.payload);
      setPreviewCounts(check.counts);
    } catch {
      setParseError("Could not parse JSON backup file.");
    }
  }

  function handleRestore() {
    if (!parsedPayload) return;
    if (mode === "replace" && confirmText !== "REPLACE") {
      toast.error('Type "REPLACE" to confirm replacing all DSA data.');
      return;
    }

    startTransition(async () => {
      try {
        if (mode === "replace") {
          // Automatically download a fresh backup before destructive replace
          const preBackup = await exportDsaBackup();
          triggerJsonDownload(
            preBackup.backup,
            `dsa-pre-replace-backup-${preBackup.backup.exportedAt.slice(0, 10)}.json`
          );
        }

        const res = await restoreDsaBackup({
          rawPayload: parsedPayload,
          mode,
          confirmationText: confirmText,
        });

        if (!res.ok) {
          toast.error(res.error ?? "Restore failed");
          return;
        }

        toast.success(
          `Restored (${mode}): ${res.restored?.topics ?? 0} topics, ${res.restored?.problems ?? 0} problems, ${res.restored?.attempts ?? 0} attempts.`
        );
        setParsedPayload(null);
        setPreviewCounts(null);
        setConfirmText("");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Restore failed");
      }
    });
  }

  return (
    <div id="backup" className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">Backup & Restore</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Full JSON export/restore preserving IDs across dev and production.
            {lastBackupAt ? ` Last backup: ${lastBackupAt.slice(0, 10)}.` : " No backup exported yet."}
          </p>
        </div>
        <Button
          type="button"
          onClick={handleExport}
          disabled={isPending}
          className="min-h-[44px] text-xs shrink-0"
        >
          <Download className="h-4 w-4 mr-1.5" />
          Export Full Backup JSON
        </Button>
      </div>

      <div className="border-t border-border pt-4 space-y-3">
        <div className="section-label">Restore from Backup JSON</div>
        <label className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border p-4 text-center cursor-pointer hover:bg-muted/40 min-h-[76px]">
          <input
            type="file"
            accept=".json,application/json"
            onChange={handleFileSelect}
            className="sr-only"
          />
          <Upload className="h-4 w-4 text-muted-foreground mb-1" />
          <span className="text-xs font-medium">Tap to select backup .json file</span>
        </label>

        {parseError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 flex items-center gap-2 text-xs text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{parseError}</span>
          </div>
        )}

        {previewCounts && parsedPayload && (
          <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
            <div className="text-xs font-semibold">
              Backup Preview (exported {parsedPayload.exportedAt.slice(0, 10)})
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center text-xs">
              <div className="rounded border border-border bg-card p-2">
                <div className="font-semibold">{previewCounts.hasSettings ? "Yes" : "No"}</div>
                <div className="text-[10px] text-muted-foreground">Settings</div>
              </div>
              <div className="rounded border border-border bg-card p-2">
                <div className="font-semibold">{previewCounts.topics}</div>
                <div className="text-[10px] text-muted-foreground">Topics</div>
              </div>
              <div className="rounded border border-border bg-card p-2">
                <div className="font-semibold">{previewCounts.problems}</div>
                <div className="text-[10px] text-muted-foreground">Problems</div>
              </div>
              <div className="rounded border border-border bg-card p-2">
                <div className="font-semibold">{previewCounts.attempts}</div>
                <div className="text-[10px] text-muted-foreground">Attempts</div>
              </div>
              <div className="rounded border border-border bg-card p-2">
                <div className="font-semibold">{previewCounts.sessions}</div>
                <div className="text-[10px] text-muted-foreground">Sessions</div>
              </div>
              <div className="rounded border border-border bg-card p-2">
                <div className="font-semibold">{previewCounts.contests}</div>
                <div className="text-[10px] text-muted-foreground">Contests</div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode("merge")}
                className={`min-h-[44px] rounded-lg border px-3 py-2 text-left text-xs ${
                  mode === "merge"
                    ? "border-primary bg-primary/10 font-medium"
                    : "border-border bg-background"
                }`}
              >
                <div>Merge (safe)</div>
                <div className="text-[11px] text-muted-foreground font-normal">
                  Upsert by ID; never deletes existing rows.
                </div>
              </button>
              <button
                type="button"
                onClick={() => setMode("replace")}
                className={`min-h-[44px] rounded-lg border px-3 py-2 text-left text-xs ${
                  mode === "replace"
                    ? "border-destructive bg-destructive/10 font-medium"
                    : "border-border bg-background"
                }`}
              >
                <div>Replace all DSA data</div>
                <div className="text-[11px] text-muted-foreground font-normal">
                  Downloads a fresh backup first, then replaces all DSA data.
                </div>
              </button>
            </div>

            {mode === "replace" && (
              <div>
                <label className="section-label block mb-1">
                  Type REPLACE to confirm
                </label>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="REPLACE"
                  className="w-full min-h-[44px] rounded-lg border border-destructive/50 bg-background px-3 text-xs font-mono"
                />
              </div>
            )}

            <Button
              type="button"
              variant={mode === "replace" ? "destructive" : "default"}
              disabled={isPending || (mode === "replace" && confirmText !== "REPLACE")}
              onClick={handleRestore}
              className="min-h-[44px] text-xs"
            >
              {isPending
                ? "Restoring..."
                : mode === "replace"
                ? "Backup & Replace All DSA Data"
                : "Merge Backup"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
