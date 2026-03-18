"use client";

import { ErrorFallback } from "@/components/error-fallback";

export default function ReviewError({
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
      title="Could not load review session"
      description="There was a problem loading your review cards. Please try again."
    />
  );
}
