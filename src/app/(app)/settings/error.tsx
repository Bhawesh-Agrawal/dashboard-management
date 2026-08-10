"use client";

import { useEffect } from "react";
import { PageHeader } from "@/components/shared/page-header";

export default function SettingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Settings page error:", error);
  }, [error]);

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Configure grading, attendance, integrations, and preferences"
      />
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm text-muted-foreground mb-4">
          Something went wrong while loading settings.
        </p>
        <button
          onClick={reset}
          className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
