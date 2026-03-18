import { SkeletonBox, SkeletonCard } from "@/components/skeleton";

export default function CoursesLoading() {
  return (
    <div className="min-h-screen px-4 py-6 md:px-8 max-w-4xl mx-auto" role="status" aria-label="Loading">
      <span className="sr-only">Loading courses...</span>
      <SkeletonBox className="h-9 w-32 mb-2" />
      <SkeletonBox className="h-4 w-56 mb-8" />
      <div className="space-y-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonCard key={i} className="h-40" />
        ))}
      </div>
    </div>
  );
}
