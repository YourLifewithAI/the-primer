import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ensureUser } from "@/lib/ensure-user";
import { getDueReviews, getReviewStats } from "@/lib/fsrs-service";
import { notifyReviewsDue } from "@/lib/notifications";
import { db } from "@/lib/db";

/**
 * GET /api/reviews/due
 *
 * Returns all due review cards for the authenticated student.
 * Optional query param: courseId to filter by course.
 */
export async function GET(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await ensureUser(clerkId);
  const courseId = req.nextUrl.searchParams.get("courseId") ?? undefined;

  try {
    const [reviews, stats] = await Promise.all([
      getDueReviews(user.id, courseId),
      getReviewStats(user.id, courseId),
    ]);

    // If 5+ cards due, send a review reminder (debounced: max once per 24h)
    if (stats.dueNow >= 5) {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentReminder = await db.notification.findFirst({
        where: {
          userId: user.id,
          type: "REVIEW_REMINDER",
          createdAt: { gte: oneDayAgo },
        },
      });
      if (!recentReminder) {
        notifyReviewsDue(user.id, stats.dueNow).catch(() => {});
      }
    }

    return NextResponse.json({ reviews, stats });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch due reviews";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
