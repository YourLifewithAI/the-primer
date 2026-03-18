"use client";

import { ErrorFallback } from "@/components/error-fallback";

export default function CoursesError({
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
      title="Could not load courses"
      description="There was a problem loading the course catalog. Please try again."
    />
  );
}
