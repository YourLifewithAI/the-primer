import Link from "next/link";

export default function ParentNotFound() {
  return (
    <main className="min-h-[60vh] flex items-center justify-center px-4" role="main">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-2xl font-bold">Not Found</h1>
        <p className="text-muted-foreground">
          The requested child or resource could not be found.
        </p>
        <Link
          href="/parent"
          className="inline-block px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Back to Parent Dashboard
        </Link>
      </div>
    </main>
  );
}
