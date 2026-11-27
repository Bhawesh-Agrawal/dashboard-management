"use client";

import { useEffect, useState } from "react";
import { AlertCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logStructuredError } from "@/lib/errors/report";

export function RouteErrorState({
  error,
  reset,
  area = "app",
}: {
  error: Error & { digest?: string };
  reset: () => void;
  area?: string;
}) {
  const [requestId] = useState(() =>
    error.digest ? error.digest.slice(0, 12) : logStructuredError(area, error)
  );

  useEffect(() => {
    logStructuredError(area, error, requestId);
  }, [area, error, requestId]);

  return (
    <div className="flex min-h-[50dvh] flex-col items-center justify-center p-6 text-center space-y-4">
      <div className="h-12 w-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center">
        <AlertCircle className="h-6 w-6" />
      </div>
      <div className="space-y-1 max-w-sm">
        <h2 className="text-base font-semibold text-foreground">
          Something went wrong
        </h2>
        <p className="text-sm text-muted-foreground">
          This section couldn&apos;t load right now. Try again in a moment.
        </p>
        <p className="text-xs text-muted-foreground font-mono">Ref: {requestId}</p>
      </div>
      <Button
        type="button"
        onClick={() => reset()}
        className="min-h-[44px]"
      >
        <RotateCcw className="h-4 w-4 mr-2" />
        Retry
      </Button>
    </div>
  );
}
