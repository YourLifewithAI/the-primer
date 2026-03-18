import { SkeletonBox, SkeletonCard } from "@/components/skeleton";

export default function LearnLoading() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8" role="status" aria-label="Loading">
      <span className="sr-only">Loading your playlist...</span>
      {/* Header: streak + timer */}
      <div className="flex items-center justify-between mb-6">
        <SkeletonBox className="h-8 w-32" />
        <SkeletonBox className="h-8 w-20" />
      </div>
      {/* Playlist items */}
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonCard key={i} className="h-24" />
        ))}
      </div>
    </div>
  );
}
