"use client";

import { useState, useEffect } from "react";
import { StreakMilestoneToast } from "./streak-milestone";
import { getMilestone } from "@/lib/streak-milestones";
import type { StreakMilestone } from "@/lib/streak-milestones";

interface StreakMilestoneCheckProps {
  streakCount: number;
}

/**
 * Client component that checks if the current streak is at a milestone
 * and shows a toast if so. Uses sessionStorage to avoid repeat toasts
 * within the same browser session.
 */
export function StreakMilestoneCheck({ streakCount }: StreakMilestoneCheckProps) {
  const [milestone, setMilestone] = useState<StreakMilestone | null>(null);

  useEffect(() => {
    const m = getMilestone(streakCount);
    if (!m) return;

    // Only show once per session per milestone
    const key = `streak-milestone-${m}`;
    if (typeof window !== "undefined" && sessionStorage.getItem(key)) return;

    setMilestone(m);
    if (typeof window !== "undefined") {
      sessionStorage.setItem(key, "shown");
    }
  }, [streakCount]);

  if (!milestone) return null;

  return (
    <StreakMilestoneToast
      milestone={milestone}
      onDismiss={() => setMilestone(null)}
    />
  );
}
