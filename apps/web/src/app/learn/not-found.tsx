import Link from "next/link";

export default function LearnNotFound() {
  return (
    <main className="min-h-[60vh] flex items-center justify-center px-4" role="main">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-2xl font-bold">Lesson Not Found</h1>
        <p className="text-muted-foreground">
          This lesson may have been removed or you may not be enrolled.
        </p>
        <Link
          href="/courses"
          className="inline-block px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Browse Courses
        </Link>
      </div>
    </main>
  );
}
