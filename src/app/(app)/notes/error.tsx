"use client";

import { RouteErrorState } from "@/components/shared/route-error-state";

export default function NotesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteErrorState error={error} reset={reset} area="notes" />;
}
