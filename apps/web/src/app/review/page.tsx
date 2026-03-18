import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ensureUser } from "@/lib/ensure-user";
import { getDueReviews, getReviewStats } from "@/lib/fsrs-service";
import { db } from "@/lib/db";
import { ReviewSession } from "@/components/review-session";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Review",
  description: "Spaced repetition review session for long-term retention.",
};

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in");

  const user = await ensureUser(clerkId);

  // Get the student's first enrolled course (same logic as learn page)
  const enrollment = await db.enrollment.findFirst({
    where: { studentId: user.id },
    include: { course: true },
  });

  const courseId = enrollment?.courseId;

  const [reviews, stats] = await Promise.all([
    getDueReviews(user.id, courseId),
    getReviewStats(user.id, courseId),
  ]);

  return (
    <main className="max-w-2xl mx-auto px-4 py-8" role="main" aria-labelledby="review-title">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 id="review-title" className="text-2xl font-bold">Review</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {stats.dueNow > 0
              ? `${stats.dueNow} card${stats.dueNow !== 1 ? "s" : ""} due now`
              : "No cards due right now"}
            {stats.dueToday > stats.dueNow && stats.dueNow > 0 && (
              <span>
                {" "}
                &middot; {stats.dueToday - stats.dueNow} more later today
              </span>
            )}
          </p>
        </div>
        <Link
          href="/learn"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Back to Playlist
        </Link>
      </div>

      {/* Stats bar */}
      {stats.totalCards > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="border border-border rounded-lg p-3 text-center">
            <div className="text-lg font-bold">{stats.totalCards}</div>
            <div className="text-xs text-muted-foreground">Total Cards</div>
          </div>
          <div className="border border-border rounded-lg p-3 text-center">
            <div className="text-lg font-bold">
              {Math.round(stats.averageRetrievability * 100)}%
            </div>
            <div className="text-xs text-muted-foreground">Avg Recall</div>
          </div>
          <div className="border border-border rounded-lg p-3 text-center">
            <div className="text-lg font-bold">{stats.totalLapses}</div>
            <div className="text-xs text-muted-foreground">Total Lapses</div>
          </div>
        </div>
      )}

      <ReviewSession initialReviews={reviews} stats={stats} />
    </main>
  );
}
