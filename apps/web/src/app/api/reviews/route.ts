import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ensureUser } from "@/lib/ensure-user";
import { reviewCard } from "@/lib/fsrs-service";
import type { ReviewRating } from "@primer/shared";

/**
 * POST /api/reviews
 *
 * Submit a spaced repetition review for a mastered KC.
 * The student rates their recall: again, hard, good, or easy.
 */
export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await ensureUser(clerkId);

  let body: { kcId?: string; rating?: ReviewRating };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { kcId, rating } = body;

  if (!kcId || !rating) {
    return NextResponse.json(
      { error: "Missing required fields: kcId, rating" },
      { status: 400 }
    );
  }

  const validRatings: ReviewRating[] = ["again", "hard", "good", "easy"];
  if (!validRatings.includes(rating)) {
    return NextResponse.json(
      { error: `Invalid rating. Must be one of: ${validRatings.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    const result = await reviewCard(user.id, kcId, rating);

    return NextResponse.json({
      kcId: result.kcId,
      rating: result.rating,
      isLapse: result.isLapse,
      nextDue: result.nextDue.toISOString(),
      intervalDescription: result.intervalDescription,
      card: {
        state: result.card.state,
        stability: result.card.stability,
        difficulty: result.card.difficulty,
        reps: result.card.reps,
        lapses: result.card.lapses,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to process review";
    const isNotFound = message.includes("No FSRS card found");
    return NextResponse.json(
      { error: message },
      { status: isNotFound ? 404 : 500 }
    );
  }
}
