"use client";

import { RouteErrorState } from "@/components/shared/route-error-state";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="bg-background text-foreground">
        <RouteErrorState error={error} reset={reset} area="global" />
      </body>
    </html>
  );
}
