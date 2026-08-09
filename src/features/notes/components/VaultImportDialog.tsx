"use client";

import { useState, useCallback, useRef } from "react";
import { Upload, FileText, FolderOpen, Link, AlertTriangle, Check, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { importVaultFiles } from "@/features/notes/lib/actions-import";
import { cn } from "@/lib/utils";

type ImportStep = "upload" | "importing" | "summary";

type ImportSummary = {
  notesCreated: number;
  foldersCreated: number;
  linksResolved: number;
  unresolvedLinks: string[];
};

type VaultImportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function VaultImportDialog({ open, onOpenChange }: VaultImportDialogProps) {
  const [step, setStep] = useState<ImportStep>("upload");
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setStep("upload");
    setSummary(null);
    setError(null);
  }, []);

  const handleClose = useCallback(
    (value: boolean) => {
      if (!value) reset();
      onOpenChange(value);
    },
    [onOpenChange, reset]
  );

  const processFiles = useCallback(async (fileList: FileList | File[]) => {
    setStep("importing");
    setError(null);

    const mdFiles: { name: string; content: string }[] = [];
    const files = Array.from(fileList);

    for (const file of files) {
      if (file.name.endsWith(".md")) {
        const content = await file.text();
        mdFiles.push({ name: file.name, content });
      } else if (file.name.endsWith(".zip")) {
        try {
          const JSZip = (await import("jszip")).default;
          const zip = await JSZip.loadAsync(file);
          const entries = Object.values(zip.files).filter((f) => f.name.endsWith(".md") && !f.dir);
          for (const entry of entries) {
            const content = await entry.async("text");
            mdFiles.push({ name: entry.name, content });
          }
        } catch {
          setError("Failed to read zip file. Make sure it's a valid zip archive.");
          setStep("upload");
          return;
        }
      }
    }

    if (mdFiles.length === 0) {
      setError("No markdown files found in the upload.");
      setStep("upload");
      return;
    }

    const result = await importVaultFiles(mdFiles);
    if (result.ok) {
      setSummary({
        notesCreated: result.data.notesCreated,
        foldersCreated: result.data.foldersCreated,
        linksResolved: result.data.linksResolved,
        unresolvedLinks: result.data.unresolvedLinks,
      });
      setStep("summary");
    } else {
      setError(result.error);
      setStep("upload");
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      if (e.dataTransfer.files?.length) {
        processFiles(e.dataTransfer.files);
      }
    },
    [processFiles]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files?.length) {
        processFiles(e.target.files);
      }
    },
    [processFiles]
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="sm:max-w-lg"
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
      >
        <div className="flex items-center justify-between">
          <DialogTitle className="font-serif">Import Vault</DialogTitle>
          <button
            type="button"
            onClick={() => handleClose(false)}
            className="p-1 rounded hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {step === "upload" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Import an Obsidian vault or markdown files. Folder structure will be
              preserved and [[wikilinks]] will be resolved automatically.
            </p>

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <div
              className={cn(
                "flex flex-col items-center justify-center gap-3 p-8 rounded-lg border-2 border-dashed transition-colors cursor-pointer",
                dragActive
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-muted-foreground/50"
              )}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-8 w-8 text-muted-foreground" />
              <div className="text-center">
                <p className="text-sm font-medium">
                  Drop .zip or .md files here
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  or click to browse
                </p>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".md,.zip"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>
        )}

        {step === "importing" && (
          <div className="flex flex-col items-center justify-center gap-3 py-12">
            <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">Importing notes...</p>
          </div>
        )}

        {step === "summary" && summary && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
              <Check className="h-4 w-4" />
              Import complete!
            </div>

            <div className="grid grid-cols-3 gap-3">
              <SummaryCard
                icon={<FileText className="h-4 w-4" />}
                label="Notes"
                count={summary.notesCreated}
              />
              <SummaryCard
                icon={<FolderOpen className="h-4 w-4" />}
                label="Folders"
                count={summary.foldersCreated}
              />
              <SummaryCard
                icon={<Link className="h-4 w-4" />}
                label="Links"
                count={summary.linksResolved}
              />
            </div>

            {summary.unresolvedLinks.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Unresolved wikilinks ({summary.unresolvedLinks.length})
                </p>
                <div className="max-h-32 overflow-y-auto rounded-md border border-border p-2">
                  {summary.unresolvedLinks.map((link, i) => (
                    <p key={i} className="text-xs text-muted-foreground py-0.5">
                      [[{link}]]
                    </p>
                  ))}
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => handleClose(false)}
              className="w-full h-9 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Done
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SummaryCard({
  icon,
  label,
  count,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
}) {
  return (
    <div className="flex flex-col items-center gap-1 p-3 rounded-md border border-border">
      <div className="text-muted-foreground">{icon}</div>
      <p className="text-lg font-semibold">{count}</p>
      <p className="text-[0.6rem] text-muted-foreground uppercase tracking-wide">
        {label}
      </p>
    </div>
  );
}
