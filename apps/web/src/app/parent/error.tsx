"use client";

import { ErrorFallback } from "@/components/error-fallback";

export default function ParentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorFallback
      error={error}
      reset={reset}
      title="Could not load parent dashboard"
      description="There was a problem loading the parent dashboard. Please try again."
    />
  );
}
