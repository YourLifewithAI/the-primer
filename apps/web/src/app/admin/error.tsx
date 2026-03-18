"use client";

import { ErrorFallback } from "@/components/error-fallback";

export default function AdminError({
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
      title="Could not load admin dashboard"
      description="There was a problem loading the admin area. Please try again."
    />
  );
}
