"use client";

import { ErrorFallback } from "@/components/error-fallback";

export default function GuideError({
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
      title="Could not load guide dashboard"
      description="There was a problem loading the guide dashboard. Please try again."
    />
  );
}
