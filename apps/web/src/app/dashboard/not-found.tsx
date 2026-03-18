import Link from "next/link";

export default function DashboardNotFound() {
  return (
    <main className="min-h-[60vh] flex items-center justify-center px-4" role="main">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-2xl font-bold">Dashboard Not Found</h1>
        <p className="text-muted-foreground">
          We could not find the dashboard you are looking for.
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
