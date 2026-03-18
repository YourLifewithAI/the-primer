"use client";

/**
 * Reusable skeleton primitives for loading states.
 */

export function SkeletonBox({
  className = "",
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`bg-border/50 rounded animate-skeleton ${className}`}
      aria-hidden="true"
      {...props}
    />
  );
}

export function SkeletonText({
  lines = 3,
  className = "",
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={`space-y-2 ${className}`} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonBox
          key={i}
          className="h-4"
          style={{ width: i === lines - 1 ? "60%" : "100%" }}
        />
      ))}
    </div>
  );
}

export function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div
      className={`border border-border rounded-lg p-4 ${className}`}
      aria-hidden="true"
    >
      <SkeletonBox className="h-4 w-24 mb-2" />
      <SkeletonBox className="h-8 w-16 mb-1" />
      <SkeletonBox className="h-3 w-20" />
    </div>
  );
}

export function SkeletonStatRow({
  count = 4,
  className = "",
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div
      className={`grid grid-cols-2 md:grid-cols-${count} gap-4 ${className}`}
      aria-hidden="true"
    >
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

export function SkeletonPage({
  title = true,
  stats = true,
  sections = 2,
}: {
  title?: boolean;
  stats?: boolean;
  sections?: number;
}) {
  return (
    <div className="min-h-screen px-4 py-6 md:px-8 max-w-4xl mx-auto" role="status" aria-label="Loading">
      <span className="sr-only">Loading content...</span>
      {title && (
        <div className="mb-8">
          <SkeletonBox className="h-8 w-48 mb-2" />
          <SkeletonBox className="h-4 w-64" />
        </div>
      )}
      {stats && <SkeletonStatRow className="mb-8" />}
      {Array.from({ length: sections }).map((_, i) => (
        <div key={i} className="mb-8">
          <SkeletonBox className="h-5 w-32 mb-4" />
          <div className="border border-border rounded-lg p-6">
            <SkeletonText lines={4} />
          </div>
        </div>
      ))}
    </div>
  );
}
