import Link from "next/link";

export default function GuideNotFound() {
  return (
    <main className="min-h-[60vh] flex items-center justify-center px-4" role="main">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-2xl font-bold">Not Found</h1>
        <p className="text-muted-foreground">
          The requested guide resource could not be found.
        </p>
        <Link
          href="/guide"
          className="inline-block px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Back to Guide Dashboard
        </Link>
      </div>
    </main>
  );
}
