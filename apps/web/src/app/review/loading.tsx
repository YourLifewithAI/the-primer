import { SkeletonBox, SkeletonCard } from "@/components/skeleton";

export default function ReviewLoading() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8" role="status" aria-label="Loading">
      <span className="sr-only">Loading review session...</span>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <SkeletonBox className="h-8 w-24 mb-2" />
          <SkeletonBox className="h-4 w-40" />
        </div>
        <SkeletonBox className="h-8 w-32" />
      </div>
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
      {/* Review card placeholder */}
      <div className="border border-border rounded-lg p-8">
        <SkeletonBox className="h-6 w-3/4 mx-auto mb-4" />
        <SkeletonBox className="h-32 w-full mb-4" />
        <SkeletonBox className="h-10 w-32 mx-auto" />
      </div>
    </div>
  );
}
