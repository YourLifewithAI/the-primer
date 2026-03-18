import Link from "next/link";

export default function ReviewNotFound() {
  return (
    <main className="min-h-[60vh] flex items-center justify-center px-4" role="main">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-2xl font-bold">Review Not Found</h1>
        <p className="text-muted-foreground">
          No review session found. You may need to enroll in a course first.
        </p>
        <Link
          href="/learn"
          className="inline-block px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Go to Playlist
        </Link>
      </div>
    </main>
  );
}
