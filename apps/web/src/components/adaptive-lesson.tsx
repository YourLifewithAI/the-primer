"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ProblemViewer } from "./problem-viewer";
import type { MasteryEvent } from "./problem-viewer";
import { MasteryBar } from "./mastery-bar";
import { MasteryCelebration } from "./mastery-celebration";
import { SessionSummary } from "./session-summary";
import type { SessionStats } from "./session-summary";
import type { ProblemDefinition } from "@primer/shared/src/content-schema";

interface AdaptiveLessonProps {
  lessonId: string;
  /** Fallback: all problems in order (for unauthenticated users) */
  staticProblems: Array<{ dbId: string; problem: ProblemDefinition }>;
}

interface NextProblemResponse {
  lessonComplete: boolean;
  blocked?: boolean;
  message?: string;
  problem?: {
    id: string;
    title: string;
    difficulty: number;
    content: ProblemDefinition;
  };
  targetKc?: {
    id: string;
    pMastery: number;
    totalAttempts: number;
    correctCount: number;
  };
  progress?: {
    totalKCs: number;
    masteredKCs: number;
    readyKCs: number;
  };
}

type Mode = "adaptive" | "static";

export function AdaptiveLesson({
  lessonId,
  staticProblems,
}: AdaptiveLessonProps) {
  const [mode, setMode] = useState<Mode>("static");
  const [loading, setLoading] = useState(true);
  const [currentProblem, setCurrentProblem] = useState<{
    dbId: string;
    problem: ProblemDefinition;
  } | null>(null);
  const [lessonComplete, setLessonComplete] = useState(false);
  const [progress, setProgress] = useState<{
    totalKCs: number;
    masteredKCs: number;
    readyKCs: number;
  } | null>(null);
  const [targetKc, setTargetKc] = useState<{
    id: string;
    pMastery: number;
    totalAttempts: number;
    correctCount: number;
  } | null>(null);
  const [problemCount, setProblemCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Gamification state
  const [celebrationKc, setCelebrationKc] = useState<MasteryEvent | null>(null);
  const [sessionMastered, setSessionMastered] = useState<string[]>([]);
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [sessionHints, setSessionHints] = useState(0);
  const [showSessionSummary, setShowSessionSummary] = useState(false);
  const router = useRouter();

  const fetchNextProblem = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/next-problem/${lessonId}`);
      if (res.status === 401) {
        // Not logged in — fall back to static mode
        setMode("static");
        setLoading(false);
        return;
      }
      if (!res.ok) {
        throw new Error(`Failed to fetch next problem: ${res.status}`);
      }

      const data: NextProblemResponse = await res.json();

      if (data.lessonComplete) {
        setLessonComplete(true);
        setProgress(data.progress ?? null);
        setLoading(false);
        return;
      }

      if (data.blocked) {
        // Prerequisites not met — show a message
        setError(data.message ?? "Prerequisites not yet met.");
        setLoading(false);
        return;
      }

      if (data.problem) {
        setMode("adaptive");
        setCurrentProblem({
          dbId: data.problem.id,
          problem: {
            ...data.problem.content,
            id: data.problem.id,
            title: data.problem.title,
            difficulty: data.problem.difficulty,
          },
        });
        setTargetKc(data.targetKc ?? null);
        setProgress(data.progress ?? null);
      }

      setLoading(false);
    } catch {
      // On any error, fall back to static mode
      setMode("static");
      setLoading(false);
    }
  }, [lessonId]);

  // Fetch the first adaptive problem on mount
  useEffect(() => {
    fetchNextProblem();
  }, [fetchNextProblem]);

  const handleMastery = useCallback((event: MasteryEvent) => {
    setCelebrationKc(event);
    setSessionMastered((prev) =>
      prev.includes(event.kcName) ? prev : [...prev, event.kcName]
    );
  }, []);

  const handleProblemComplete = useCallback(
    (results: { stepId: string; correct: boolean; attempts: number; hintsUsed: number }[]) => {
      setProblemCount((c) => c + 1);
      // Track session stats
      const correctSteps = results.filter((r) => r.attempts === 1).length;
      const hintSteps = results.reduce((s, r) => s + r.hintsUsed, 0);
      setSessionCorrect((c) => c + correctSteps);
      setSessionHints((h) => h + hintSteps);
      // Small delay before fetching next
      setTimeout(() => fetchNextProblem(), 800);
    },
    [fetchNextProblem]
  );

  // Static mode — show all problems in sequence (for unauthenticated users)
  if (mode === "static") {
    return (
      <div className="space-y-6">
        <h2 className="text-lg font-semibold">
          Practice ({staticProblems.length} problems)
        </h2>
        {staticProblems.map((sp, i) => (
          <div key={sp.dbId}>
            <div className="text-sm text-muted-foreground mb-2">
              Problem {i + 1} of {staticProblems.length}
            </div>
            <ProblemViewer problemId={sp.dbId} problem={sp.problem} />
          </div>
        ))}
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="border border-border rounded-lg p-8 text-center">
        <div className="text-muted-foreground">Loading next problem...</div>
      </div>
    );
  }

  // Lesson complete — show session summary
  if (lessonComplete) {
    const sessionStats: SessionStats = {
      problemsAttempted: problemCount,
      correctCount: sessionCorrect,
      hintsUsed: sessionHints,
      kcsProgressed: [],
      kcsMastered: sessionMastered,
      streakCount: 0, // Will be populated if we fetch it
    };

    return (
      <div className="space-y-4 animate-fade-in">
        <SessionSummary
          stats={sessionStats}
          onContinue={() => router.push("/learn")}
          onGoToDashboard={() => router.push("/dashboard")}
        />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="border border-amber-500/30 bg-amber-500/5 rounded-lg p-6 text-center">
        <p className="text-amber-700 dark:text-amber-400">{error}</p>
      </div>
    );
  }

  // Adaptive mode — show one problem at a time
  return (
    <div className="space-y-4">
      {/* Progress bar */}
      {progress && (
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>
            {progress.masteredKCs}/{progress.totalKCs} skills mastered
          </span>
          <div className="flex-1 h-2 bg-border rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all duration-500"
              style={{
                width: `${Math.round(
                  (progress.masteredKCs / progress.totalKCs) * 100
                )}%`,
              }}
            />
          </div>
          {problemCount > 0 && (
            <span>{problemCount} solved</span>
          )}
        </div>
      )}

      {/* Target KC indicator */}
      {targetKc && (
        <MasteryBar
          name={`Current focus`}
          pMastery={targetKc.pMastery}
          totalAttempts={targetKc.totalAttempts}
          correctCount={targetKc.correctCount}
          masteredAt={null}
          threshold={0.95}
        />
      )}

      {/* Current problem */}
      {currentProblem && (
        <ProblemViewer
          key={currentProblem.dbId}
          problemId={currentProblem.dbId}
          problem={currentProblem.problem}
          onComplete={handleProblemComplete}
          onMastery={handleMastery}
          kcName={targetKc?.id}
          pMastery={targetKc?.pMastery}
          totalKcAttempts={targetKc?.totalAttempts}
        />
      )}

      {/* Mastery celebration modal */}
      {celebrationKc && (
        <MasteryCelebration
          kcName={celebrationKc.kcName}
          pMastery={celebrationKc.pMastery}
          onDismiss={() => setCelebrationKc(null)}
        />
      )}
    </div>
  );
}
