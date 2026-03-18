"use client";

import { ErrorFallback } from "@/components/error-fallback";

export default function LearnError({
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
      title="Could not load playlist"
      description="There was a problem generating your learning playlist. Please try again."
    />
  );
}
