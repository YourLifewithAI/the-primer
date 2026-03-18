/**
 * FSRS (Free Spaced Repetition Scheduler) integration for The Primer.
 *
 * FSRS manages post-mastery review scheduling. Once a student masters a KC
 * via BKT (P(L) >= 0.95), it transitions to FSRS for long-term retention.
 *
 * The FSRS algorithm uses a DSR (Difficulty, Stability, Retrievability) model:
 * - Difficulty: how hard the material is for this student (1-10)
 * - Stability: the interval (in days) at which retrievability = 90%
 * - Retrievability: probability of recall at a given time
 *
 * We use the ts-fsrs library which implements FSRS v6.
 *
 * Reference: https://github.com/open-spaced-repetition/ts-fsrs
 */

import {
  fsrs,
  createEmptyCard,
  generatorParameters,
  type Card,
  type RecordLogItem,
  Rating,
  State,
  type Grade,
} from "ts-fsrs";

// Re-export for consumers
export { Rating, State } from "ts-fsrs";
export type { Card, Grade, RecordLogItem } from "ts-fsrs";

// ─── Configuration ──────────────────────────────────────────

/** FSRS parameters tuned for K-12 math learning. */
const PRIMER_FSRS_PARAMS = generatorParameters({
  request_retention: 0.9, // Target 90% recall
  maximum_interval: 180, // Cap at 6 months for young learners
  enable_fuzz: true, // Add slight randomness to intervals
  enable_short_term: true, // Use learning steps for new cards
  learning_steps: ["10m", "1d"], // 10 minutes, then 1 day
  relearning_steps: ["10m"], // Re-learn in 10 minutes
});

/** The configured FSRS scheduler instance. */
const scheduler = fsrs(PRIMER_FSRS_PARAMS);

// ─── Types ──────────────────────────────────────────────────

/** Rating mapped from student performance (used by our system, not raw FSRS). */
export type ReviewRating = "again" | "hard" | "good" | "easy";

/** Serialized card state for database storage. */
export interface FsrsCardData {
  state: number; // State enum: 0=New, 1=Learning, 2=Review, 3=Relearning
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  dueDate: Date;
  lastReviewAt: Date | null;
  scheduledDays: number;
  learningSteps: number;
}

/** Result of processing a review. */
export interface ReviewResult {
  card: FsrsCardData;
  rating: Rating;
  /** Whether this was a lapse (forgot a previously known card). */
  isLapse: boolean;
  /** Next review date. */
  nextDue: Date;
  /** Human-readable interval description. */
  intervalDescription: string;
}

/** A review item ready for display. */
export interface ReviewItem {
  kcId: string;
  kcName: string;
  stability: number;
  difficulty: number;
  state: number;
  reps: number;
  lapses: number;
  dueDate: string; // ISO string
  lastReviewAt: string | null;
  /** Retrievability: estimated probability of recall right now. */
  retrievability: number;
  /** Whether this card is overdue. */
  isOverdue: boolean;
}

// ─── Core Functions ─────────────────────────────────────────

/**
 * Create a new FSRS card for a KC that just reached mastery.
 * The card starts in the Learning state since the student just demonstrated mastery
 * via BKT -- we want one review to confirm before entering the full review schedule.
 */
export function createNewCard(now?: Date): FsrsCardData {
  const card = createEmptyCard(now ?? new Date());
  return cardToData(card);
}

/**
 * Map a student's performance to an FSRS Rating.
 *
 * We infer the rating from the BKT response context:
 * - Got it right on first try, fast → Easy
 * - Got it right on first try → Good
 * - Got it right but needed hints or multiple attempts → Hard
 * - Got it wrong / gave up → Again
 */
export function performanceToRating(
  correct: boolean,
  hintsUsed: number,
  attemptNumber: number,
  responseTimeMs: number
): ReviewRating {
  if (!correct) return "again";
  if (attemptNumber > 1 || hintsUsed > 0) return "hard";
  // Fast and correct on first try = easy (under 10 seconds)
  if (responseTimeMs < 10_000) return "easy";
  return "good";
}

/**
 * Convert our string rating to FSRS Rating enum.
 */
export function ratingToFsrs(rating: ReviewRating): Grade {
  const map: Record<ReviewRating, Grade> = {
    again: Rating.Again,
    hard: Rating.Hard,
    good: Rating.Good,
    easy: Rating.Easy,
  };
  return map[rating];
}

/**
 * Process a review and return the updated card state.
 */
export function processReview(
  cardData: FsrsCardData,
  rating: ReviewRating,
  now?: Date
): ReviewResult {
  const card = dataToCard(cardData);
  const fsrsRating = ratingToFsrs(rating);
  const reviewTime = now ?? new Date();

  const result: RecordLogItem = scheduler.repeat(card, reviewTime)[fsrsRating];

  const newCardData = cardToData(result.card);
  const wasReview = cardData.state === State.Review;
  const isLapse = wasReview && fsrsRating === Rating.Again;

  return {
    card: newCardData,
    rating: fsrsRating,
    isLapse,
    nextDue: result.card.due,
    intervalDescription: describeInterval(result.card.due, reviewTime),
  };
}

/**
 * Calculate retrievability (probability of recall) for a card at a given time.
 */
export function getRetrievability(cardData: FsrsCardData, now?: Date): number {
  if (cardData.state === State.New) return 1;
  if (!cardData.lastReviewAt) return 1;

  const currentTime = now ?? new Date();
  const lastReview = new Date(cardData.lastReviewAt);
  const elapsedDays =
    (currentTime.getTime() - lastReview.getTime()) / (1000 * 60 * 60 * 24);

  if (elapsedDays <= 0) return 1;
  if (cardData.stability <= 0) return 0;

  // FSRS forgetting curve: R(t,S) = (1 + FACTOR * t / (9 * S))^DECAY
  // Using default FSRS-5 decay = -0.5, factor = 19/81
  const decay = -0.5;
  const factor = 19 / 81;
  const retrievability = Math.pow(
    1 + (factor * elapsedDays) / (9 * cardData.stability),
    decay
  );

  return Math.max(0, Math.min(1, retrievability));
}

/**
 * Check if a card is due for review.
 */
export function isDue(cardData: FsrsCardData, now?: Date): boolean {
  const currentTime = now ?? new Date();
  return new Date(cardData.dueDate) <= currentTime;
}

/**
 * Get the count of due cards from a list of card data.
 */
export function countDueCards(cards: FsrsCardData[], now?: Date): number {
  return cards.filter((c) => isDue(c, now)).length;
}

// ─── Helpers ────────────────────────────────────────────────

/** Convert a ts-fsrs Card to our serializable format. */
function cardToData(card: Card): FsrsCardData {
  return {
    state: card.state as number,
    stability: card.stability,
    difficulty: card.difficulty,
    reps: card.reps,
    lapses: card.lapses,
    dueDate: card.due,
    lastReviewAt: card.last_review ?? null,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
  };
}

/** Convert our serialized format back to a ts-fsrs Card. */
function dataToCard(data: FsrsCardData): Card {
  return {
    state: data.state as State,
    stability: data.stability,
    difficulty: data.difficulty,
    reps: data.reps,
    lapses: data.lapses,
    due: new Date(data.dueDate),
    last_review: data.lastReviewAt ? new Date(data.lastReviewAt) : undefined,
    elapsed_days: 0, // deprecated field
    scheduled_days: data.scheduledDays,
    learning_steps: data.learningSteps,
  };
}

/** Human-readable interval description. */
function describeInterval(due: Date, from: Date): string {
  const diffMs = due.getTime() - from.getTime();
  const diffMins = Math.round(diffMs / (1000 * 60));
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return "now";
  if (diffMins < 60) return `${diffMins} min`;
  if (diffHours < 24) return `${diffHours} hr`;
  if (diffDays === 1) return "1 day";
  if (diffDays < 30) return `${diffDays} days`;
  const diffMonths = Math.round(diffDays / 30);
  if (diffMonths === 1) return "1 month";
  return `${diffMonths} months`;
}
