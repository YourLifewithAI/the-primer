"use client";

import { useState, useCallback } from "react";
import type { ReviewItem, ReviewRating } from "@primer/shared";
import { announce } from "@/lib/a11y";

interface ReviewSessionProps {
  initialReviews: ReviewItem[];
  stats: {
    totalCards: number;
    dueNow: number;
    dueToday: number;
    averageRetrievability: number;
  };
}

interface ReviewResponse {
  kcId: string;
  rating: number;
  isLapse: boolean;
  nextDue: string;
  intervalDescription: string;
  card: {
    state: number;
    stability: number;
    difficulty: number;
    reps: number;
    lapses: number;
  };
}

const RATING_CONFIG: Record<
  ReviewRating,
  { label: string; description: string; color: string; shortcut: string }
> = {
  again: {
    label: "Again",
    description: "Forgot it",
    color: "bg-red-500 hover:bg-red-600",
    shortcut: "1",
  },
  hard: {
    label: "Hard",
    description: "Took effort to recall",
    color: "bg-orange-500 hover:bg-orange-600",
    shortcut: "2",
  },
  good: {
    label: "Good",
    description: "Recalled correctly",
    color: "bg-blue-500 hover:bg-blue-600",
    shortcut: "3",
  },
  easy: {
    label: "Easy",
    description: "Instant recall",
    color: "bg-green-500 hover:bg-green-600",
    shortcut: "4",
  },
};

export function ReviewSession({ initialReviews, stats }: ReviewSessionProps) {
  const [reviews] = useState<ReviewItem[]>(initialReviews);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [lastResult, setLastResult] = useState<ReviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [lapses, setLapses] = useState(0);
  const [sessionDone, setSessionDone] = useState(false);

  const currentReview = reviews[currentIndex] ?? null;

  const submitRating = useCallback(
    async (rating: ReviewRating) => {
      if (!currentReview || loading) return;
      setLoading(true);

      try {
        const res = await fetch("/api/reviews", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kcId: currentReview.kcId,
            rating,
          }),
        });

        if (!res.ok) {
          throw new Error("Failed to submit review");
        }

        const result: ReviewResponse = await res.json();
        setLastResult(result);
        setCompleted((c) => c + 1);
        if (result.isLapse) {
          setLapses((l) => l + 1);
          announce(`Lapse recorded. Next review: ${result.intervalDescription}`, "polite");
        } else {
          announce(`Rated. Next review: ${result.intervalDescription}`, "polite");
        }

        // Move to next card after a brief pause
        setTimeout(() => {
          if (currentIndex + 1 >= reviews.length) {
            setSessionDone(true);
            announce("Review session complete!", "assertive");
          } else {
            setCurrentIndex((i) => i + 1);
            setShowAnswer(false);
            setLastResult(null);
          }
          setLoading(false);
        }, 800);
      } catch {
        setLoading(false);
      }
    },
    [currentReview, currentIndex, reviews.length, loading]
  );

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!showAnswer) {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          setShowAnswer(true);
        }
        return;
      }
      if (loading) return;

      const ratingMap: Record<string, ReviewRating> = {
        "1": "again",
        "2": "hard",
        "3": "good",
        "4": "easy",
      };
      const rating = ratingMap[e.key];
      if (rating) {
        e.preventDefault();
        submitRating(rating);
      }
    },
    [showAnswer, loading, submitRating]
  );

  // No reviews due
  if (reviews.length === 0) {
    return (
      <div className="border border-green-500/30 bg-green-500/5 rounded-lg p-8 text-center">
        <h3 className="text-xl font-semibold mb-2">All caught up!</h3>
        <p className="text-muted-foreground">
          No reviews due right now. Keep learning new skills!
        </p>
        {stats.totalCards > 0 && (
          <p className="text-sm text-muted-foreground mt-2">
            {stats.totalCards} skills in review &middot;{" "}
            {Math.round(stats.averageRetrievability * 100)}% average recall
          </p>
        )}
        <a
          href="/learn"
          className="inline-block mt-4 px-5 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium"
        >
          Continue Learning
        </a>
      </div>
    );
  }

  // Session complete
  if (sessionDone) {
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="border border-green-500/30 bg-green-500/5 rounded-lg p-8 text-center">
          <h3 className="text-xl font-semibold mb-2">Review Complete!</h3>
          <p className="text-muted-foreground">
            {completed} card{completed !== 1 ? "s" : ""} reviewed
            {lapses > 0 && ` (${lapses} to relearn)`}
          </p>
          <div className="flex justify-center gap-3 mt-4">
            <a
              href="/learn"
              className="px-5 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium"
            >
              Continue Learning
            </a>
            <a
              href="/review"
              className="px-5 py-2 border border-border rounded-lg hover:bg-muted transition-colors text-sm font-medium"
            >
              Check for More
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (!currentReview) return null;

  const retrievabilityPct = Math.round(currentReview.retrievability * 100);

  return (
    <div
      className="space-y-6 outline-none"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      role="region"
      aria-label={`Review card ${completed + 1} of ${reviews.length}`}
    >
      {/* Progress */}
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span>
          {completed + 1}/{reviews.length} reviews
        </span>
        <div className="flex-1 h-2 bg-border rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-500"
            style={{
              width: `${Math.round((completed / reviews.length) * 100)}%`,
            }}
          />
        </div>
        {lapses > 0 && (
          <span className="text-red-400">{lapses} lapsed</span>
        )}
      </div>

      {/* Card */}
      <div className="border border-border rounded-lg p-6 sm:p-8 min-h-[240px] flex flex-col items-center justify-center text-center">
        {/* Front: KC Name */}
        <div className="mb-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
            Do you remember?
          </div>
          <h2 className="text-2xl font-bold">{currentReview.kcName}</h2>
        </div>

        {/* Card metadata */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>Recall: {retrievabilityPct}%</span>
          <span>Reviews: {currentReview.reps}</span>
          {currentReview.lapses > 0 && (
            <span className="text-red-400">
              Lapses: {currentReview.lapses}
            </span>
          )}
        </div>

        {!showAnswer ? (
          /* Show answer button */
          <button
            onClick={() => setShowAnswer(true)}
            className="mt-6 px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium cursor-pointer min-h-[48px]"
          >
            Show Answer
            <span className="ml-2 text-xs opacity-70">(Space)</span>
          </button>
        ) : (
          /* Rating buttons */
          <div className="mt-6 space-y-3 w-full max-w-md animate-fade-in">
            {lastResult && (
              <div className="text-sm text-muted-foreground mb-2">
                Next review: {lastResult.intervalDescription}
              </div>
            )}
            <div className="grid grid-cols-4 gap-2">
              {(
                Object.entries(RATING_CONFIG) as [
                  ReviewRating,
                  (typeof RATING_CONFIG)[ReviewRating],
                ][]
              ).map(([rating, config]) => (
                <button
                  key={rating}
                  onClick={() => submitRating(rating)}
                  disabled={loading}
                  className={`${config.color} text-white rounded-lg py-3 px-2 text-sm font-medium transition-colors disabled:opacity-50 cursor-pointer min-h-[48px]`}
                >
                  <div>{config.label}</div>
                  <div className="text-xs opacity-80 mt-0.5">
                    {config.shortcut}
                  </div>
                </button>
              ))}
            </div>
            <div className="text-xs text-muted-foreground text-center">
              Press 1-4 or click to rate your recall
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
