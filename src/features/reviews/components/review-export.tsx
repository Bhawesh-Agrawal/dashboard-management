"use client";

import { useTransition } from "react";
import { exportReviewAsMarkdown } from "../lib/actions";
import { Download } from "lucide-react";

export function ReviewExport({ reviewId }: { reviewId: string }) {
  const [pending, startTransition] = useTransition();

  function handleExport() {
    startTransition(async () => {
      const md = await exportReviewAsMarkdown(reviewId);
      const blob = new Blob([md], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `review-${reviewId.slice(0, 8)}.md`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  return (
    <button
      onClick={handleExport}
      disabled={pending}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground border border-border rounded-md transition-colors disabled:opacity-50"
    >
      <Download className="h-3.5 w-3.5" />
      {pending ? "Exporting..." : "Export MD"}
    </button>
  );
}
