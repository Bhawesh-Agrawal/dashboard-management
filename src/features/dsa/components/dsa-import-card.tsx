"use client";

import { useState, useTransition } from "react";
import { Upload, FileSpreadsheet, Download, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { previewDsaImport, confirmDsaImport } from "../lib/import-actions";
import type { ImportDryRunPreview } from "../lib/import-diff";

type InputMode = "file" | "text";

export function DsaImportCard() {
  const [mode, setMode] = useState<InputMode>("file");
  const [rawContent, setRawContent] = useState("");
  const [format, setFormat] = useState<"csv" | "json" | "text">("csv");
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportDryRunPreview | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const isJson =
      file.name.toLowerCase().endsWith(".json") || text.trimStart().startsWith("[") || text.trimStart().startsWith("{");
    setFormat(isJson ? "json" : "csv");
    setRawContent(text);
    setFileName(file.name);
    setPreview(null);
  }

  function handlePreview() {
    if (!rawContent.trim()) {
      toast.error("Provide a CSV/JSON file or paste CSV/TSV text first.");
      return;
    }
    startTransition(async () => {
      try {
        const effectiveFormat = mode === "text" ? "text" : format;
        const result = await previewDsaImport({ content: rawContent, format: effectiveFormat });
        setPreview(result);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to preview import.");
      }
    });
  }

  function handleConfirm() {
    if (!preview || preview.invalidRows.length > 0) return;
    startTransition(async () => {
      try {
        const effectiveFormat = mode === "text" ? "text" : format;
        const res = await confirmDsaImport({ content: rawContent, format: effectiveFormat });
        if (!res.ok) {
          toast.error(res.error ?? "Import failed.");
          return;
        }
        toast.success(
          `Imported: ${res.created} new, ${res.updated} updated, ${res.unchanged} unchanged, ${res.archived} archived.`
        );
        setPreview(null);
        setRawContent("");
        setFileName(null);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Import failed.");
      }
    });
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">Import Question Bank</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Upload CSV or JSON, or paste CSV/TSV rows. Personal progress and attempt history are never overwritten.
          </p>
        </div>
        <a
          href="/dsa/import-template.csv"
          download="dsa-import-template.csv"
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted min-h-[44px] whitespace-nowrap"
        >
          <Download className="h-3.5 w-3.5" />
          Download Template CSV
        </a>
      </div>

      {/* Mode Switch */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => {
            setMode("file");
            setPreview(null);
          }}
          className={`min-h-[44px] rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
            mode === "file"
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background text-foreground border-border hover:bg-muted"
          }`}
        >
          <Upload className="h-3.5 w-3.5" />
          CSV / JSON File
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("text");
            setFormat("text");
            setPreview(null);
          }}
          className={`min-h-[44px] rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
            mode === "text"
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background text-foreground border-border hover:bg-muted"
          }`}
        >
          <FileSpreadsheet className="h-3.5 w-3.5" />
          Paste CSV / TSV
        </button>
      </div>

      {mode === "file" ? (
        <div className="space-y-2">
          <label className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border p-5 text-center cursor-pointer hover:bg-muted/40 min-h-[88px]">
            <input
              type="file"
              accept=".csv,.tsv,.json,text/csv,application/json"
              onChange={handleFileSelect}
              className="sr-only"
            />
            <Upload className="h-5 w-5 text-muted-foreground mb-1.5" />
            <span className="text-xs font-medium">
              {fileName ? `Selected: ${fileName} (${format.toUpperCase()})` : "Tap to select .csv or .json file"}
            </span>
          </label>
        </div>
      ) : (
        <textarea
          value={rawContent}
          onChange={(e) => {
            setRawContent(e.target.value);
            setPreview(null);
          }}
          rows={6}
          placeholder="topic,subtopic,title,difficulty,url,platform,platform_id,order,tags,import_key"
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ring"
        />
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={handlePreview}
          disabled={isPending || !rawContent.trim()}
          className="min-h-[44px]"
        >
          {isPending ? "Analyzing..." : "Dry-Run Preview"}
        </Button>
      </div>

      {preview && (
        <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h4 className="text-sm font-semibold">Dry-Run Preview</h4>
            <span className="text-xs text-muted-foreground">
              {preview.topicsInFileOrder.length} topic(s) in file order
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
            <div className="rounded-md border border-border bg-card p-2">
              <div className="text-base font-semibold text-emerald-600 dark:text-emerald-400">
                {preview.newRows.length}
              </div>
              <div className="text-[11px] text-muted-foreground">New</div>
            </div>
            <div className="rounded-md border border-border bg-card p-2">
              <div className="text-base font-semibold text-amber-600 dark:text-amber-400">
                {preview.updatedRows.length}
              </div>
              <div className="text-[11px] text-muted-foreground">Updated</div>
            </div>
            <div className="rounded-md border border-border bg-card p-2">
              <div className="text-base font-semibold">{preview.unchangedRows.length}</div>
              <div className="text-[11px] text-muted-foreground">Unchanged</div>
            </div>
            <div className="rounded-md border border-border bg-card p-2">
              <div className="text-base font-semibold text-muted-foreground">
                {preview.missingFromFile.length}
              </div>
              <div className="text-[11px] text-muted-foreground">Will Archive</div>
            </div>
            <div className="rounded-md border border-border bg-card p-2 col-span-2 sm:col-span-1">
              <div className="text-base font-semibold text-destructive">
                {preview.invalidRows.length}
              </div>
              <div className="text-[11px] text-muted-foreground">Invalid</div>
            </div>
          </div>

          {preview.invalidRows.length > 0 && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Fix invalid rows before confirming import:
              </div>
              <ul className="space-y-1 text-xs text-destructive max-h-40 overflow-y-auto">
                {preview.invalidRows.map((err) => (
                  <li key={`${err.rowNumber}-${err.reason}`}>
                    Row {err.rowNumber} ({err.rawTitle}): {err.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {preview.updatedRows.length > 0 && (
            <div className="text-xs space-y-1 max-h-32 overflow-y-auto">
              <p className="font-medium text-muted-foreground">Updated problems:</p>
              {preview.updatedRows.slice(0, 15).map((u) => (
                <div key={u.id} className="truncate">
                  {u.topic} — {u.title} ({u.changedFields.join(", ")})
                </div>
              ))}
              {preview.updatedRows.length > 15 && (
                <div className="text-muted-foreground">
                  +{preview.updatedRows.length - 15} more
                </div>
              )}
            </div>
          )}

          {preview.missingFromFile.length > 0 && (
            <div className="text-xs space-y-1 max-h-28 overflow-y-auto">
              <p className="font-medium text-muted-foreground">
                Missing from file (will be archived, never deleted):
              </p>
              {preview.missingFromFile.slice(0, 10).map((m) => (
                <div key={m.id} className="truncate text-muted-foreground">
                  {m.topic} — {m.title}
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <Button
              type="button"
              onClick={handleConfirm}
              disabled={
                isPending ||
                preview.invalidRows.length > 0 ||
                preview.newRows.length + preview.updatedRows.length + preview.unchangedRows.length === 0
              }
              className="min-h-[44px]"
            >
              <CheckCircle2 className="h-4 w-4 mr-1.5" />
              {isPending ? "Importing..." : "Confirm Import"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPreview(null)}
              disabled={isPending}
              className="min-h-[44px]"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
