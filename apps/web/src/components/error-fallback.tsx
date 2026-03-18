"use client";

/**
 * Reusable error fallback UI used by error.tsx files.
 */
export function ErrorFallback({
  error,
  reset,
  title = "Something went wrong",
  description,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  title?: string;
  description?: string;
}) {
  return (
    <main
      className="min-h-[60vh] flex items-center justify-center px-4"
      role="alert"
      aria-labelledby="error-title"
    >
      <div className="max-w-md text-center space-y-4">
        <div className="text-4xl" aria-hidden="true">
          !
        </div>
        <h1 id="error-title" className="text-2xl font-bold">
          {title}
        </h1>
        <p className="text-muted-foreground">
          {description ??
            "An unexpected error occurred. Please try again."}
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground font-mono">
            Error ID: {error.digest}
          </p>
        )}
        <button
          onClick={reset}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer"
        >
          Try Again
        </button>
      </div>
    </main>
  );
}
