"use client";

import { RouteErrorState } from "@/components/shared/route-error-state";

export default function TodayError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteErrorState error={error} reset={reset} area="today" />;
}
