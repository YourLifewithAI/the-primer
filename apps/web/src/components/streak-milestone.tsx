"use client";

import { useEffect, useState } from "react";
import { announce } from "@/lib/a11y";
import type { StreakMilestone } from "@/lib/streak-milestones";
import { getMilestoneMessage } from "@/lib/streak-milestones";

interface StreakMilestoneToastProps {
  milestone: StreakMilestone;
  onDismiss: () => void;
}

/**
 * Toast notification for streak milestones.
 * Auto-dismisses after 5 seconds. Positive tone only.
 */
export function StreakMilestoneToast({
  milestone,
  onDismiss,
}: StreakMilestoneToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    announce(
      `${milestone}-day streak! ${getMilestoneMessage(milestone)}`,
      "polite"
    );

    const timer = setTimeout(() => {
      setVisible(false);
      // Wait for exit animation before unmounting
      setTimeout(onDismiss, 300);
    }, 5000);

    return () => clearTimeout(timer);
  }, [milestone, onDismiss]);

  return (
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-40 transition-all duration-300 ${
        visible
          ? "opacity-100 translate-y-0"
          : "opacity-0 translate-y-4"
      }`}
      role="status"
      aria-live="polite"
    >
      <div className="bg-background border border-orange-400/40 rounded-xl px-5 py-3.5 shadow-lg flex items-center gap-3 max-w-sm">
        <span className="text-2xl flex-shrink-0" aria-hidden="true">
          🔥
        </span>
        <div className="min-w-0">
          <div className="font-semibold text-sm">
            {milestone}-day streak!
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {getMilestoneMessage(milestone)}
          </div>
        </div>
        <button
          onClick={() => {
            setVisible(false);
            setTimeout(onDismiss, 300);
          }}
          className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors p-1 min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
          aria-label="Dismiss"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M1 1l12 12M13 1L1 13" />
          </svg>
        </button>
      </div>
    </div>
  );
}
