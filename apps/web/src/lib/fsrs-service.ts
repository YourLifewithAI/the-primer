/**
 * Server-side FSRS service for The Primer.
 *
 * Handles database interactions for spaced repetition cards.
 * Cards are created when a KC is mastered via BKT and managed
 * through the FSRS algorithm for long-term retention.
 */

import { db } from "@/lib/db";
import {
  createNewCard,
  processReview,
  getRetrievability,
  isDue,
  type FsrsCardData,
  type ReviewRating,
  type ReviewItem,
} from "@primer/shared";

// ─── Card Management ────────────────────────────────────────

/**
 * Create a new FSRS card when a student masters a KC.
 * Called from the response handler when BKT transitions to mastered.
 */
export async function createFsrsCard(
  studentId: string,
  kcId: string
): Promise<void> {
  const card = createNewCard();

  await db.fsrsCardState.upsert({
    where: { studentId_kcId: { studentId, kcId } },
    create: {
      studentId,
      kcId,
      state: card.state,
      stability: card.stability,
      difficulty: card.difficulty,
      reps: card.reps,
      lapses: card.lapses,
      scheduledDays: card.scheduledDays,
      learningSteps: card.learningSteps,
      dueDate: card.dueDate,
      lastReviewAt: card.lastReviewAt,
    },
    update: {
      // If card already exists (re-mastered after lapse), reset it
      state: card.state,
      stability: card.stability,
      difficulty: card.difficulty,
      reps: card.reps,
      lapses: card.lapses,
      scheduledDays: card.scheduledDays,
      learningSteps: card.learningSteps,
      dueDate: card.dueDate,
      lastReviewAt: card.lastReviewAt,
    },
  });
}

/**
 * Process a review for a specific KC card.
 */
export async function reviewCard(
  studentId: string,
  kcId: string,
  rating: ReviewRating
) {
  const dbCard = await db.fsrsCardState.findUnique({
    where: { studentId_kcId: { studentId, kcId } },
  });

  if (!dbCard) {
    throw new Error(`No FSRS card found for student=${studentId}, kc=${kcId}`);
  }

  const cardData: FsrsCardData = {
    state: dbCard.state,
    stability: dbCard.stability,
    difficulty: dbCard.difficulty,
    reps: dbCard.reps,
    lapses: dbCard.lapses,
    dueDate: dbCard.dueDate,
    lastReviewAt: dbCard.lastReviewAt,
    scheduledDays: dbCard.scheduledDays,
    learningSteps: dbCard.learningSteps,
  };

  const result = processReview(cardData, rating);

  // Persist updated card state
  await db.fsrsCardState.update({
    where: { id: dbCard.id },
    data: {
      state: result.card.state,
      stability: result.card.stability,
      difficulty: result.card.difficulty,
      reps: result.card.reps,
      lapses: result.card.lapses,
      scheduledDays: result.card.scheduledDays,
      learningSteps: result.card.learningSteps,
      dueDate: result.card.dueDate,
      lastReviewAt: result.card.lastReviewAt,
    },
  });

  // If the student lapsed, optionally reset BKT mastery
  if (result.isLapse) {
    // Reduce BKT mastery slightly on lapse (they forgot)
    const mastery = await db.studentMasteryState.findUnique({
      where: { studentId_kcId: { studentId, kcId } },
    });
    if (mastery && mastery.pMastery > 0.8) {
      await db.studentMasteryState.update({
        where: { id: mastery.id },
        data: {
          pMastery: 0.85, // Drop below threshold so they get active practice
          masteredAt: null, // Clear mastery timestamp
        },
      });
    }
  }

  return {
    ...result,
    kcId,
  };
}

/**
 * Get all due review cards for a student.
 */
export async function getDueReviews(
  studentId: string,
  courseId?: string
): Promise<ReviewItem[]> {
  // Base query: all FSRS cards for this student
  const where: { studentId: string; kcId?: { in: string[] } } = { studentId };

  // If course filter, get KC IDs for that course
  if (courseId) {
    const courseKCs = await db.problemKC.findMany({
      where: {
        problem: { lesson: { module: { courseId } } },
      },
      select: { kcId: true },
      distinct: ["kcId"],
    });
    where.kcId = { in: courseKCs.map((pk) => pk.kcId) };
  }

  const cards = await db.fsrsCardState.findMany({
    where,
    include: {
      kc: {
        select: { id: true, name: true },
      },
    },
    orderBy: { dueDate: "asc" },
  });

  const now = new Date();

  return cards
    .filter((card) => {
      const cardData: FsrsCardData = {
        state: card.state,
        stability: card.stability,
        difficulty: card.difficulty,
        reps: card.reps,
        lapses: card.lapses,
        dueDate: card.dueDate,
        lastReviewAt: card.lastReviewAt,
        scheduledDays: 0,
        learningSteps: 0,
      };
      return isDue(cardData, now);
    })
    .map((card) => {
      const cardData: FsrsCardData = {
        state: card.state,
        stability: card.stability,
        difficulty: card.difficulty,
        reps: card.reps,
        lapses: card.lapses,
        dueDate: card.dueDate,
        lastReviewAt: card.lastReviewAt,
        scheduledDays: 0,
        learningSteps: 0,
      };

      return {
        kcId: card.kcId,
        kcName: card.kc.name,
        stability: card.stability,
        difficulty: card.difficulty,
        state: card.state,
        reps: card.reps,
        lapses: card.lapses,
        dueDate: card.dueDate.toISOString(),
        lastReviewAt: card.lastReviewAt?.toISOString() ?? null,
        retrievability: getRetrievability(cardData, now),
        isOverdue: card.dueDate < now,
      };
    });
}

/**
 * Get review statistics for a student.
 */
export async function getReviewStats(
  studentId: string,
  courseId?: string
): Promise<{
  totalCards: number;
  dueNow: number;
  dueToday: number;
  averageStability: number;
  averageRetrievability: number;
  totalLapses: number;
}> {
  const where: { studentId: string; kcId?: { in: string[] } } = { studentId };

  if (courseId) {
    const courseKCs = await db.problemKC.findMany({
      where: {
        problem: { lesson: { module: { courseId } } },
      },
      select: { kcId: true },
      distinct: ["kcId"],
    });
    where.kcId = { in: courseKCs.map((pk) => pk.kcId) };
  }

  const cards = await db.fsrsCardState.findMany({ where });

  if (cards.length === 0) {
    return {
      totalCards: 0,
      dueNow: 0,
      dueToday: 0,
      averageStability: 0,
      averageRetrievability: 0,
      totalLapses: 0,
    };
  }

  const now = new Date();
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  let dueNow = 0;
  let dueToday = 0;
  let totalStability = 0;
  let totalRetrievability = 0;
  let totalLapses = 0;

  for (const card of cards) {
    const cardData: FsrsCardData = {
      state: card.state,
      stability: card.stability,
      difficulty: card.difficulty,
      reps: card.reps,
      lapses: card.lapses,
      dueDate: card.dueDate,
      lastReviewAt: card.lastReviewAt,
      scheduledDays: card.scheduledDays,
      learningSteps: card.learningSteps,
    };

    if (isDue(cardData, now)) dueNow++;
    if (isDue(cardData, endOfToday)) dueToday++;
    totalStability += card.stability;
    totalRetrievability += getRetrievability(cardData, now);
    totalLapses += card.lapses;
  }

  return {
    totalCards: cards.length,
    dueNow,
    dueToday,
    averageStability: totalStability / cards.length,
    averageRetrievability: totalRetrievability / cards.length,
    totalLapses,
  };
}
