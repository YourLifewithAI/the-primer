/**
 * Analytics queries for the Parent Dashboard.
 *
 * Provides child-level data aggregations for parents to monitor
 * their children's progress. All comparisons are against the child's
 * own past performance only — never against other students (FERPA).
 */

import { db } from "@/lib/db";
import { MASTERY_THRESHOLD } from "@primer/shared";

// ─── Types ──────────────────────────────────────────────────

export interface ChildOverview {
  childId: string;
  childName: string | null;
  gradeLevel: number | null;
  totalKCs: number;
  masteredKCs: number;
  averageMastery: number;
  currentStreak: number;
  problemsThisWeek: number;
  lastActiveAt: Date | null;
}

export interface ChildDetail {
  childId: string;
  childName: string | null;
  gradeLevel: number | null;
  masteryBySubject: SubjectMastery[];
  masteryStates: KCMasteryState[];
  recentActivity: ActivityEntry[];
  fsrsStats: FsrsStats;
  tutorStats: TutorStats;
  timeStats: TimeStats;
  streak: StreakInfo;
}

export interface SubjectMastery {
  subject: string;
  totalKCs: number;
  masteredKCs: number;
  averageMastery: number;
}

export interface KCMasteryState {
  kcId: string;
  kcName: string;
  subject: string;
  pMastery: number;
  isMastered: boolean;
  totalAttempts: number;
  correctCount: number;
  accuracy: number;
  lastAttemptAt: Date | null;
  masteredAt: Date | null;
}

export interface ActivityEntry {
  id: string;
  type: "problem" | "lesson" | "tutor" | "review";
  title: string;
  correct?: boolean;
  createdAt: Date;
}

export interface FsrsStats {
  totalCards: number;
  cardsDue: number;
  averageStability: number;
  totalLapses: number;
  cardsInReview: number;
  cardsInLearning: number;
}

export interface TutorStats {
  totalSessions: number;
  sessionsThisWeek: number;
  topTopics: string[];
  averageSessionLength: number; // minutes
}

export interface TimeStats {
  dailyMinutes: { date: string; minutes: number }[];
  weeklyTotal: number;
  dailyAverage: number;
}

export interface StreakInfo {
  current: number;
  longest: number;
  todayComplete: boolean;
  last7Days: boolean[];
}

export interface WeeklyReport {
  childName: string | null;
  gradeLevel: number | null;
  weekStarting: string;
  weekEnding: string;
  problemsSolved: number;
  problemsCorrect: number;
  accuracy: number;
  masteryGains: { kcName: string; previousMastery: number; currentMastery: number }[];
  newlyMastered: string[];
  timeInvested: number; // minutes
  strengths: string[];
  areasForPractice: string[];
  streak: number;
  encouragement: string;
}

// ─── Queries ────────────────────────────────────────────────

/**
 * Get overview summaries for all linked children.
 */
export async function getChildrenOverview(
  childIds: string[]
): Promise<ChildOverview[]> {
  if (childIds.length === 0) return [];

  const children = await db.user.findMany({
    where: { id: { in: childIds }, role: "STUDENT" },
    include: {
      studentProfile: { select: { gradeLevel: true } },
      masteryStates: {
        select: { pMastery: true },
      },
    },
  });

  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const results: ChildOverview[] = [];

  for (const child of children) {
    // Weekly problem count
    const weeklyResponses = await db.problemResponse.count({
      where: {
        studentId: child.id,
        createdAt: { gte: oneWeekAgo },
      },
    });

    // Last active
    const lastResponse = await db.problemResponse.findFirst({
      where: { studentId: child.id },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });

    // Streak calculation (simplified — just count consecutive days)
    const streak = await calculateStreak(child.id);

    const totalKCs = child.masteryStates.length;
    const masteredKCs = child.masteryStates.filter(
      (ms) => ms.pMastery >= MASTERY_THRESHOLD
    ).length;
    const averageMastery =
      totalKCs > 0
        ? child.masteryStates.reduce((sum, ms) => sum + ms.pMastery, 0) / totalKCs
        : 0;

    results.push({
      childId: child.id,
      childName: child.name,
      gradeLevel: child.studentProfile?.gradeLevel ?? null,
      totalKCs,
      masteredKCs,
      averageMastery,
      currentStreak: streak.current,
      problemsThisWeek: weeklyResponses,
      lastActiveAt: lastResponse?.createdAt ?? null,
    });
  }

  return results;
}

/**
 * Get detailed progress data for a specific child.
 */
export async function getChildDetail(childId: string): Promise<ChildDetail> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: childId },
    include: {
      studentProfile: { select: { gradeLevel: true } },
      masteryStates: {
        include: {
          kc: { select: { id: true, name: true, subject: true } },
        },
        orderBy: { updatedAt: "desc" },
      },
      responses: {
        orderBy: { createdAt: "desc" },
        take: 30,
        include: {
          problem: { select: { title: true } },
        },
      },
      fsrsCards: true,
      tutorSessions: {
        orderBy: { startedAt: "desc" },
        take: 50,
      },
    },
  });

  // ─── Mastery by subject ───
  const subjectMap = new Map<
    string,
    { total: number; mastered: number; sum: number }
  >();
  const masteryStates: KCMasteryState[] = user.masteryStates.map((ms) => {
    const subject = ms.kc.subject;
    const entry = subjectMap.get(subject) ?? { total: 0, mastered: 0, sum: 0 };
    entry.total++;
    entry.sum += ms.pMastery;
    if (ms.pMastery >= MASTERY_THRESHOLD) entry.mastered++;
    subjectMap.set(subject, entry);

    return {
      kcId: ms.kcId,
      kcName: ms.kc.name,
      subject,
      pMastery: ms.pMastery,
      isMastered: ms.pMastery >= MASTERY_THRESHOLD,
      totalAttempts: ms.totalAttempts,
      correctCount: ms.correctCount,
      accuracy: ms.totalAttempts > 0 ? ms.correctCount / ms.totalAttempts : 0,
      lastAttemptAt: ms.lastAttemptAt,
      masteredAt: ms.masteredAt,
    };
  });

  const masteryBySubject: SubjectMastery[] = [...subjectMap.entries()].map(
    ([subject, data]) => ({
      subject,
      totalKCs: data.total,
      masteredKCs: data.mastered,
      averageMastery: data.total > 0 ? data.sum / data.total : 0,
    })
  );

  // ─── Recent activity ───
  const recentActivity: ActivityEntry[] = user.responses.map((r) => ({
    id: r.id,
    type: "problem" as const,
    title: r.problem.title,
    correct: r.correct,
    createdAt: r.createdAt,
  }));

  // Add tutor sessions to activity
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentTutor = user.tutorSessions.filter(
    (ts) => ts.startedAt >= oneWeekAgo
  );
  for (const ts of recentTutor) {
    recentActivity.push({
      id: ts.id,
      type: "tutor",
      title: "AI Tutor Session",
      createdAt: ts.startedAt,
    });
  }

  // Sort by date
  recentActivity.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  // ─── FSRS stats ───
  const now = new Date();
  const fsrsStats: FsrsStats = {
    totalCards: user.fsrsCards.length,
    cardsDue: user.fsrsCards.filter((c) => c.dueDate <= now).length,
    averageStability:
      user.fsrsCards.length > 0
        ? user.fsrsCards.reduce((sum, c) => sum + c.stability, 0) /
          user.fsrsCards.length
        : 0,
    totalLapses: user.fsrsCards.reduce((sum, c) => sum + c.lapses, 0),
    cardsInReview: user.fsrsCards.filter((c) => c.state === 2).length,
    cardsInLearning: user.fsrsCards.filter(
      (c) => c.state === 1 || c.state === 3
    ).length,
  };

  // ─── Tutor stats ───
  const weeklyTutor = user.tutorSessions.filter(
    (ts) => ts.startedAt >= oneWeekAgo
  );
  // Derive top topics from problems linked to tutor sessions
  const topTopics: string[] = [];
  if (weeklyTutor.length > 0) {
    const problemIds = weeklyTutor
      .map((ts) => ts.problemId)
      .filter((id): id is string => id !== null);
    if (problemIds.length > 0) {
      const problems = await db.problem.findMany({
        where: { id: { in: problemIds } },
        include: {
          lesson: {
            include: { module: { include: { course: { select: { title: true } } } } },
          },
        },
      });
      const topicSet = new Set(problems.map((p) => p.lesson.module.course.title));
      topTopics.push(...[...topicSet].slice(0, 3));
    }
  }

  const avgSessionLength =
    user.tutorSessions.length > 0
      ? user.tutorSessions
          .filter((ts) => ts.endedAt)
          .reduce((sum, ts) => {
            const duration =
              (ts.endedAt!.getTime() - ts.startedAt.getTime()) / 60000;
            return sum + duration;
          }, 0) /
        Math.max(
          user.tutorSessions.filter((ts) => ts.endedAt).length,
          1
        )
      : 0;

  const tutorStats: TutorStats = {
    totalSessions: user.tutorSessions.length,
    sessionsThisWeek: weeklyTutor.length,
    topTopics,
    averageSessionLength: avgSessionLength,
  };

  // ─── Time stats (from engagement aggregates) ───
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const aggregates = await db.engagementAggregate.findMany({
    where: {
      studentId: childId,
      date: { gte: twoWeeksAgo },
    },
    orderBy: { date: "asc" },
  });

  const dailyMinutes = aggregates.map((a) => ({
    date: a.date.toISOString().split("T")[0],
    minutes: a.activeMinutes,
  }));

  const thisWeekAggs = aggregates.filter(
    (a) => a.date >= oneWeekAgo
  );
  const weeklyTotal = thisWeekAggs.reduce(
    (sum, a) => sum + a.activeMinutes,
    0
  );

  const timeStats: TimeStats = {
    dailyMinutes,
    weeklyTotal,
    dailyAverage: thisWeekAggs.length > 0 ? weeklyTotal / thisWeekAggs.length : 0,
  };

  // ─── Streak ───
  const streak = await calculateStreak(childId);

  return {
    childId: user.id,
    childName: user.name,
    gradeLevel: user.studentProfile?.gradeLevel ?? null,
    masteryBySubject,
    masteryStates,
    recentActivity: recentActivity.slice(0, 30),
    fsrsStats,
    tutorStats,
    timeStats,
    streak,
  };
}

/**
 * Generate weekly progress report data for a child.
 */
export async function getWeeklyReport(childId: string): Promise<WeeklyReport> {
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const now = new Date();

  const user = await db.user.findUniqueOrThrow({
    where: { id: childId },
    include: {
      studentProfile: { select: { gradeLevel: true } },
      masteryStates: {
        include: {
          kc: { select: { name: true } },
        },
      },
    },
  });

  // This week's responses
  const weekResponses = await db.problemResponse.findMany({
    where: {
      studentId: childId,
      createdAt: { gte: oneWeekAgo },
    },
  });

  const problemsSolved = weekResponses.length;
  const problemsCorrect = weekResponses.filter((r) => r.correct).length;
  const accuracy = problemsSolved > 0 ? problemsCorrect / problemsSolved : 0;

  // Newly mastered this week
  const newlyMastered = user.masteryStates
    .filter(
      (ms) =>
        ms.masteredAt &&
        ms.masteredAt >= oneWeekAgo &&
        ms.pMastery >= MASTERY_THRESHOLD
    )
    .map((ms) => ms.kc.name);

  // Mastery gains: KCs with attempts this week
  const weekKcIds = [...new Set(weekResponses.filter((r) => r.kcId).map((r) => r.kcId!))];
  const masteryGains = user.masteryStates
    .filter((ms) => weekKcIds.includes(ms.kcId))
    .map((ms) => ({
      kcName: ms.kc.name,
      previousMastery: Math.max(0, ms.pMastery - 0.1), // Approximate — we don't store historical
      currentMastery: ms.pMastery,
    }));

  // Strengths: highest mastery KCs
  const strengths = user.masteryStates
    .filter((ms) => ms.pMastery >= MASTERY_THRESHOLD)
    .sort((a, b) => b.pMastery - a.pMastery)
    .slice(0, 3)
    .map((ms) => ms.kc.name);

  // Areas for practice: lowest mastery KCs with attempts
  const areasForPractice = user.masteryStates
    .filter((ms) => ms.pMastery < MASTERY_THRESHOLD && ms.totalAttempts > 0)
    .sort((a, b) => a.pMastery - b.pMastery)
    .slice(0, 3)
    .map((ms) => ms.kc.name);

  // Time invested
  const aggregates = await db.engagementAggregate.findMany({
    where: {
      studentId: childId,
      date: { gte: oneWeekAgo },
    },
  });
  const timeInvested = aggregates.reduce(
    (sum, a) => sum + a.activeMinutes,
    0
  );

  const streak = await calculateStreak(childId);

  // Generate encouraging message
  const encouragement = generateEncouragement(
    problemsSolved,
    newlyMastered.length,
    accuracy,
    streak.current
  );

  return {
    childName: user.name,
    gradeLevel: user.studentProfile?.gradeLevel ?? null,
    weekStarting: oneWeekAgo.toISOString().split("T")[0],
    weekEnding: now.toISOString().split("T")[0],
    problemsSolved,
    problemsCorrect,
    accuracy,
    masteryGains,
    newlyMastered,
    timeInvested,
    strengths,
    areasForPractice,
    streak: streak.current,
    encouragement,
  };
}

// ─── Helpers ────────────────────────────────────────────────

async function calculateStreak(studentId: string): Promise<StreakInfo> {
  const responses = await db.problemResponse.findMany({
    where: { studentId },
    select: { createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  if (responses.length === 0) {
    return {
      current: 0,
      longest: 0,
      todayComplete: false,
      last7Days: [false, false, false, false, false, false, false],
    };
  }

  const uniqueDates = [
    ...new Set(
      responses.map((r) => {
        const d = new Date(r.createdAt);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      })
    ),
  ].sort((a, b) => b.localeCompare(a));

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const todayComplete = uniqueDates[0] === todayStr;

  let current = 0;
  const startDate = new Date(today);
  if (!todayComplete) {
    startDate.setDate(startDate.getDate() - 1);
  }

  const dateSet = new Set(uniqueDates);
  const checkDate = new Date(startDate);

  for (let i = 0; i < 365; i++) {
    const checkStr = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, "0")}-${String(checkDate.getDate()).padStart(2, "0")}`;
    if (dateSet.has(checkStr)) {
      current++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  let longest = 0;
  let streak = 1;
  for (let i = 1; i < uniqueDates.length; i++) {
    const prev = new Date(uniqueDates[i - 1]);
    const curr = new Date(uniqueDates[i]);
    const diffDays = Math.round(
      (prev.getTime() - curr.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (diffDays === 1) {
      streak++;
    } else {
      longest = Math.max(longest, streak);
      streak = 1;
    }
  }
  longest = Math.max(longest, streak, current);

  const last7Days: boolean[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    last7Days.push(dateSet.has(dStr));
  }

  return { current, longest, todayComplete, last7Days };
}

function generateEncouragement(
  problemsSolved: number,
  newlyMastered: number,
  accuracy: number,
  streak: number
): string {
  const messages: string[] = [];

  if (newlyMastered > 0) {
    messages.push(
      `Mastered ${newlyMastered} new skill${newlyMastered > 1 ? "s" : ""} this week!`
    );
  }

  if (streak >= 7) {
    messages.push(`An incredible ${streak}-day practice streak. Consistency is key!`);
  } else if (streak >= 3) {
    messages.push(`${streak} days in a row of practice. Building great habits!`);
  }

  if (accuracy >= 0.8 && problemsSolved >= 10) {
    messages.push("Strong accuracy this week. The hard work is paying off.");
  } else if (problemsSolved >= 20) {
    messages.push(
      "Lots of practice this week. Keep at it -- every attempt builds understanding."
    );
  } else if (problemsSolved > 0) {
    messages.push(
      "Every problem attempted is a step forward. Encourage a few more practice sessions this week."
    );
  } else {
    messages.push(
      "No practice this week. Even 10 minutes a day makes a difference. Let's get back on track!"
    );
  }

  return messages.join(" ");
}
