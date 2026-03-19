/**
 * Pure functions for streak milestones.
 * Separated from streaks.ts so they can be imported in client components
 * (streaks.ts imports Prisma/db which is server-only).
 */

const MILESTONES = [7, 14, 30, 60, 100, 200, 365] as const;

export type StreakMilestone = (typeof MILESTONES)[number];

/**
 * Returns the milestone tier if streakCount exactly matches one, else null.
 */
export function getMilestone(streakCount: number): StreakMilestone | null {
  for (let i = MILESTONES.length - 1; i >= 0; i--) {
    if (streakCount === MILESTONES[i]) {
      return MILESTONES[i];
    }
  }
  return null;
}

export function getMilestoneMessage(milestone: StreakMilestone): string {
  switch (milestone) {
    case 7:
      return "One week! You're building a habit.";
    case 14:
      return "Two weeks strong! Consistency pays off.";
    case 30:
      return "A whole month! That's real dedication.";
    case 60:
      return "60 days — you're unstoppable!";
    case 100:
      return "100 days! Triple digits!";
    case 200:
      return "200 days of practice. Truly impressive.";
    case 365:
      return "A full year! You're a learning machine!";
  }
}
