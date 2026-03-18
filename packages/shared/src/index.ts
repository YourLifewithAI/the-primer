/**
 * Shared types, constants, and validators for The Primer platform.
 */

// Re-export BKT engine
export {
  type BKTParams,
  type BKTUpdateResult,
  bktUpdate,
  defaultBKTParams,
  predictCorrect,
  estimateToMastery,
} from "./bkt";

// Re-export answer checker
export { checkAnswer, normalizeAnswer, numericEquals } from "./answer-checker";

// Re-export content schema
export {
  type KCDefinition,
  type HintDefinition,
  type StepDefinition,
  type ProblemDefinition,
  type LessonDefinition,
  type ModuleDefinition,
  type CourseDefinition,
  type ValidationError,
  validateCourse,
} from "./content-schema";

// Re-export FSRS engine
export {
  type FsrsCardData,
  type ReviewResult,
  type ReviewItem,
  type ReviewRating,
  Rating as FsrsRating,
  State as FsrsState,
  createNewCard,
  performanceToRating,
  ratingToFsrs,
  processReview,
  getRetrievability,
  isDue,
  countDueCards,
} from "./fsrs";

// Re-export constants (separated to break circular dependency with bkt.ts)
export {
  MASTERY_THRESHOLD,
  DEFAULT_BKT_PARAMS,
  TARGET_RETENTION,
  MAX_TUTOR_TURNS,
  IDLE_THRESHOLDS,
} from "./constants";

// ─── Types ───────────────────────────────────────────────────

export type UserRole = "STUDENT" | "PARENT" | "GUIDE" | "ADMIN";

export type Subject = "MATH" | "SCIENCE" | "ELA" | "SOCIAL_STUDIES";

export interface ProblemStep {
  id: string;
  prompt: string;
  correctAnswer: string;
  acceptableFormats?: string[];
  kcs: string[];
  hints: ProblemHint[];
}

export interface ProblemHint {
  type: "scaffold" | "more_specific" | "bottom_out";
  content: string;
}

export interface ProblemContent {
  id: string;
  title: string;
  difficulty: number;
  steps: ProblemStep[];
}

export interface PlaylistItem {
  id: string;
  type: "lesson" | "review" | "assessment";
  title: string;
  kcIds: string[];
  estimatedMinutes: number;
  status: "locked" | "available" | "in_progress" | "completed" | "review_due";
  masteryRequired: number;
  /** Number of review cards due (only for type="review" items). */
  reviewCount?: number;
  /** Average retrievability across due cards (only for type="review" items). */
  retrievability?: number;
}

export interface TutorMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface StudentStatus {
  studentId: string;
  name: string;
  status: "active" | "slowing" | "needs_help" | "idle" | "completed";
  currentKc?: string;
  consecutiveFailures: number;
  idleSeconds: number;
  inTutorSession: boolean;
}
