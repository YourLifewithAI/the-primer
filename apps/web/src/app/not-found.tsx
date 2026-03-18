import Link from "next/link";

export default function NotFound() {
  return (
    <main
      className="min-h-[60vh] flex items-center justify-center px-4"
      role="main"
      aria-labelledby="not-found-title"
    >
      <div className="max-w-md text-center space-y-4">
        <h1 id="not-found-title" className="text-4xl font-bold">
          404
        </h1>
        <p className="text-muted-foreground">
          The page you are looking for does not exist.
        </p>
        <Link
          href="/"
          className="inline-block px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Go Home
        </Link>
      </div>
    </main>
  );
}
