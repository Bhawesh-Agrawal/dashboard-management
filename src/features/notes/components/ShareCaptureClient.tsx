"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CaptureSheet } from "./CaptureSheet";
import { createCaptureNote, undoCaptureNote } from "../lib/capture-actions";
import type { SharedCapturePayload } from "../lib/share-target";

const AUTO_SAVE_STORAGE_KEY = "codexdash_auto_save_shared_v1";

export function ShareCaptureClient({ shared }: { shared: SharedCapturePayload }) {
  const router = useRouter();
  const [autoSaveShared, setAutoSaveShared] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(true);
  const autoSavedRef = useRef(false);

  useEffect(() => {
    try {
      const enabled = window.localStorage.getItem(AUTO_SAVE_STORAGE_KEY) === "1";
      setAutoSaveShared(enabled);
      if (enabled && !shared.empty && !autoSavedRef.current) {
        autoSavedRef.current = true;
        void (async () => {
          const res = await createCaptureNote({
            kind: shared.kind,
            title: shared.title ?? null,
            content: shared.text,
            sourceLink: shared.url ?? null,
          });
          if (res.ok) {
            const id = res.data.id;
            if (res.data.kind === "link" && res.data.url) {
              void fetch("/api/notes/link-metadata", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: res.data.url, noteId: id }),
              }).catch(() => {});
            }
            toast.success("Saved shared capture", {
              duration: 10000,
              action: {
                label: "Undo",
                onClick: () => void undoCaptureNote(id),
              },
            });
            router.replace("/notes");
          }
        })();
      }
    } catch {
      // Ignore storage errors
    }
  }, [router, shared]);

  function handleToggleAutoSave(next: boolean) {
    setAutoSaveShared(next);
    try {
      window.localStorage.setItem(AUTO_SAVE_STORAGE_KEY, next ? "1" : "0");
    } catch {
      // Ignore storage errors
    }
  }

  return (
    <div className="space-y-4 py-4">
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="page-heading">Shared Capture</h1>
            <p className="text-xs text-muted-foreground">
              {shared.empty
                ? "Nothing was shared — enter a note or paste a link below."
                : "Review and tap Save to add to your Notes inbox."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="min-h-[44px] rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            Open Capture
          </button>
        </div>

        <label className="flex min-h-[44px] items-center justify-between gap-3 border-t border-border pt-3 text-sm text-foreground">
          <span>Auto-save shared items immediately</span>
          <input
            type="checkbox"
            checked={autoSaveShared}
            onChange={(e) => handleToggleAutoSave(e.target.checked)}
            className="h-5 w-5 accent-primary"
          />
        </label>
      </div>

      <CaptureSheet
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open);
          if (!open) {
            router.push("/notes");
          }
        }}
        initialKind={shared.kind}
        initialText={shared.text}
        initialTitle={shared.title}
        initialUrl={shared.url}
        onCaptured={() => router.replace("/notes")}
      />
    </div>
  );
}
