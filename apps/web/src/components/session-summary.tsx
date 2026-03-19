"use client";

import { useEffect, useRef } from "react";
import { announce } from "@/lib/a11y";

export interface SessionStats {
  problemsAttempted: number;
  correctCount: number;
  hintsUsed: number;
  /** KC names that progressed during this session */
  kcsProgressed: string[];
  /** KC names that were mastered during this session */
  kcsMastered: string[];
  /** Current streak count */
  streakCount: number;
}

interface SessionSummaryProps {
  stats: SessionStats;
  onContinue: () => void;
  onGoToDashboard: () => void;
}

/**
 * Post-session debrief shown after completing a learning session.
 * Positive framing only — no penalties, no guilt.
 */
export function SessionSummary({
  stats,
  onContinue,
  onGoToDashboard,
}: SessionSummaryProps) {
  const continueRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const msg = `Session complete. ${stats.problemsAttempted} problems, ${stats.kcsMastered.length} skills mastered.`;
    announce(msg, "polite");
    continueRef.current?.focus();
  }, [stats]);

  const accuracy =
    stats.problemsAttempted > 0
      ? Math.round((stats.correctCount / stats.problemsAttempted) * 100)
      : 0;

  const encouragement = getEncouragement(accuracy, stats.kcsMastered.length);

  return (
    <div className="border border-border rounded-2xl p-6 sm:p-8 max-w-md mx-auto text-center animate-fade-in">
      <div className="text-3xl mb-3" aria-hidden="true">
        {stats.kcsMastered.length > 0 ? "🎯" : "📚"}
      </div>

      <h2 className="text-xl font-bold mb-4">Session Complete</h2>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <SummaryStat label="Problems" value={stats.problemsAttempted} />
        <SummaryStat label="Accuracy" value={`${accuracy}%`} />
        <SummaryStat label="Hints Used" value={stats.hintsUsed} />
        <SummaryStat
          label="Skills Mastered"
          value={stats.kcsMastered.length}
          highlight={stats.kcsMastered.length > 0}
        />
      </div>

      {/* Mastered skills callout */}
      {stats.kcsMastered.length > 0 && (
        <div className="bg-green-500/5 border border-green-500/20 rounded-lg px-4 py-3 mb-5">
          <div className="text-sm font-medium text-green-700 dark:text-green-400 mb-1">
            Newly Mastered
          </div>
          <div className="text-sm text-muted-foreground">
            {stats.kcsMastered.join(", ")}
          </div>
        </div>
      )}

      {/* Streak */}
      {stats.streakCount > 0 && (
        <div className="text-sm text-muted-foreground mb-5">
          🔥 {stats.streakCount} day streak
        </div>
      )}

      {/* Encouragement */}
      <p className="text-sm text-muted-foreground mb-6 italic">
        {encouragement}
      </p>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-2 justify-center">
        <button
          ref={continueRef}
          onClick={onContinue}
          className="px-5 py-2.5 min-h-[44px] bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium cursor-pointer"
        >
          Keep Learning
        </button>
        <button
          onClick={onGoToDashboard}
          className="px-5 py-2.5 min-h-[44px] border border-border rounded-lg hover:bg-accent transition-colors text-sm cursor-pointer"
        >
          View Dashboard
        </button>
      </div>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string | number;
  highlight?: boolean;
}) {
  return (
    <div className="border border-border rounded-lg py-2.5 px-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={`text-lg font-bold mt-0.5 ${
          highlight ? "text-green-600 dark:text-green-400" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function getEncouragement(accuracy: number, masteredCount: number): string {
  if (masteredCount >= 2) return "Multiple skills mastered in one session. Outstanding!";
  if (masteredCount === 1) return "Another skill in the bag. Nice work!";
  if (accuracy >= 90) return "Excellent accuracy. You really know your stuff.";
  if (accuracy >= 70) return "Solid session. Every problem makes you stronger.";
  return "Practice is progress. Keep at it!";
}
