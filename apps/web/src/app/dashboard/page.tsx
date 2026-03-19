import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { MASTERY_THRESHOLD } from "@primer/shared";
import Link from "next/link";
import { MasteryBar } from "@/components/mastery-bar";
import { StreakDisplay } from "@/components/streak-display";
import { WeeklyVelocity } from "@/components/weekly-velocity";
import { StreakMilestoneCheck } from "@/components/streak-milestone-check";
import { ensureUser } from "@/lib/ensure-user";
import { getStreak } from "@/lib/streaks";
import { getReviewStats } from "@/lib/fsrs-service";
import { db } from "@/lib/db";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Track your learning progress, mastery, and recent activity.",
};

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in");

  // Ensure user exists in DB (auto-creates from Clerk on first visit)
  const baseUser = await ensureUser(clerkId);

  // Re-fetch with all the relations we need for the dashboard
  const user = await db.user.findUniqueOrThrow({
    where: { id: baseUser.id },
    include: {
      masteryStates: {
        include: {
          kc: true,
        },
        orderBy: { updatedAt: "desc" },
      },
      enrollments: {
        include: {
          course: {
            include: {
              modules: {
                include: {
                  lessons: {
                    include: {
                      problems: {
                        include: { kcs: true },
                      },
                    },
                    orderBy: { orderIndex: "asc" },
                  },
                },
                orderBy: { orderIndex: "asc" },
              },
            },
          },
        },
      },
      responses: {
        orderBy: { createdAt: "desc" },
        take: 20,
        include: {
          problem: {
            select: { title: true, lessonId: true },
          },
        },
      },
    },
  });

  // Get the student's enrolled course for review stats
  const enrollment = await db.enrollment.findFirst({
    where: { studentId: baseUser.id },
  });

  const [streak, reviewStats] = await Promise.all([
    getStreak(baseUser.id),
    getReviewStats(baseUser.id, enrollment?.courseId),
  ]);

  // Weekly velocity: skills mastered in the last 7 days vs previous 7
  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const fourteenDaysAgo = new Date(now);
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  const thisWeekMastered = user.masteryStates.filter(
    (ms) => ms.masteredAt && ms.masteredAt >= sevenDaysAgo
  );
  const lastWeekMastered = user.masteryStates.filter(
    (ms) =>
      ms.masteredAt &&
      ms.masteredAt >= fourteenDaysAgo &&
      ms.masteredAt < sevenDaysAgo
  );

  // Per-day mastery counts for the last 7 days [today, yesterday, ..., 6 days ago]
  const dailyMasteryCounts: number[] = [];
  for (let i = 0; i < 7; i++) {
    const dayStart = new Date(now);
    dayStart.setDate(dayStart.getDate() - i);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    dailyMasteryCounts.push(
      user.masteryStates.filter(
        (ms) => ms.masteredAt && ms.masteredAt >= dayStart && ms.masteredAt < dayEnd
      ).length
    );
  }

  // Build mastery summary
  const masteryStates = user.masteryStates;
  const totalKCs = masteryStates.length;
  const masteredKCs = masteryStates.filter(
    (ms) => ms.pMastery >= MASTERY_THRESHOLD
  ).length;
  const inProgressKCs = masteryStates.filter(
    (ms) => ms.pMastery > 0.1 && ms.pMastery < MASTERY_THRESHOLD
  ).length;
  const overallMastery =
    totalKCs > 0
      ? masteryStates.reduce((sum, ms) => sum + ms.pMastery, 0) / totalKCs
      : 0;

  // Recent activity
  const recentResponses = user.responses;
  const todayResponses = recentResponses.filter(
    (r) =>
      r.createdAt.toDateString() === new Date().toDateString()
  );
  const todayCorrect = todayResponses.filter((r) => r.correct).length;

  // Get all KCs across enrolled courses (for showing unstarted ones)
  const enrolledCourseKcIds = new Set<string>();
  for (const enrollment of user.enrollments) {
    for (const mod of enrollment.course.modules) {
      for (const lesson of mod.lessons) {
        for (const problem of lesson.problems) {
          for (const pk of problem.kcs) {
            enrolledCourseKcIds.add(pk.kcId);
          }
        }
      }
    }
  }
  const unstartedKCCount = [...enrolledCourseKcIds].filter(
    (kcId) => !masteryStates.some((ms) => ms.kcId === kcId)
  ).length;

  return (
    <main className="min-h-screen px-4 py-6 md:px-8 max-w-4xl mx-auto" aria-labelledby="dashboard-title">
      {/* Header */}
      <div className="flex flex-col gap-4 mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 id="dashboard-title" className="text-2xl font-bold">My Progress</h1>
            <p className="text-muted-foreground mt-1">
              {user.name ?? "Student"} · Mastery Dashboard
            </p>
          </div>
          <Link
            href="/learn"
            className="text-sm px-4 py-2 min-h-[44px] flex items-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Continue Learning
          </Link>
        </div>

        {/* Streak + Weekly Velocity row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Featured streak card */}
          <div className="border border-border rounded-lg p-4">
            <div className="text-sm text-muted-foreground mb-2">Practice Streak</div>
            <StreakDisplay current={streak.current} last7Days={streak.last7Days} />
            {streak.longest > streak.current && (
              <div className="text-xs text-muted-foreground mt-2">
                Longest: {streak.longest} days
              </div>
            )}
          </div>

          {/* Weekly velocity */}
          <WeeklyVelocity
            thisWeek={thisWeekMastered.length}
            lastWeek={lastWeekMastered.length}
            dailyCounts={dailyMasteryCounts}
          />
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Overall Mastery"
          value={`${Math.round(overallMastery * 100)}%`}
          detail={`${totalKCs} skills tracked`}
        />
        <StatCard
          label="Skills Mastered"
          value={`${masteredKCs}`}
          detail={`of ${totalKCs + unstartedKCCount} total`}
        />
        <StatCard
          label="In Progress"
          value={`${inProgressKCs}`}
          detail={`${unstartedKCCount} not started`}
        />
        <StatCard
          label="Today"
          value={`${todayResponses.length}`}
          detail={`${todayCorrect} correct`}
        />
      </div>

      {/* Spaced Repetition */}
      {reviewStats.totalCards > 0 && (
        <section className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Spaced Repetition</h2>
            {reviewStats.dueNow > 0 && (
              <Link
                href="/review"
                className="text-sm px-3 py-1 rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors"
              >
                Review {reviewStats.dueNow} card{reviewStats.dueNow !== 1 ? "s" : ""}
              </Link>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              label="Cards in Review"
              value={`${reviewStats.totalCards}`}
              detail={`${reviewStats.dueNow} due now`}
            />
            <StatCard
              label="Due Today"
              value={`${reviewStats.dueToday}`}
              detail={reviewStats.dueNow > 0 ? "Start reviewing!" : "All caught up"}
            />
            <StatCard
              label="Avg Recall"
              value={`${Math.round(reviewStats.averageRetrievability * 100)}%`}
              detail={`${Math.round(reviewStats.averageStability)}d avg stability`}
            />
            <StatCard
              label="Lapses"
              value={`${reviewStats.totalLapses}`}
              detail="Times forgotten"
            />
          </div>
        </section>
      )}

      {/* Mastery by KC */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-4">Knowledge Components</h2>
        {masteryStates.length === 0 ? (
          <div className="border border-border rounded-lg p-8 text-center text-muted-foreground">
            <p className="text-lg mb-2">No mastery data yet</p>
            <p className="text-sm">
              Start solving problems in a{" "}
              <Link href="/courses" className="text-primary hover:underline">
                course
              </Link>{" "}
              to see your progress here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {masteryStates
              .sort((a, b) => b.pMastery - a.pMastery)
              .map((ms) => (
                <MasteryBar
                  key={ms.id}
                  name={ms.kc.name}
                  pMastery={ms.pMastery}
                  totalAttempts={ms.totalAttempts}
                  correctCount={ms.correctCount}
                  masteredAt={ms.masteredAt?.toISOString() ?? null}
                  threshold={MASTERY_THRESHOLD}
                />
              ))}
          </div>
        )}
      </section>

      {/* Recent Activity */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>
        {recentResponses.length === 0 ? (
          <p className="text-muted-foreground text-sm">No activity yet.</p>
        ) : (
          <div className="border border-border rounded-lg divide-y divide-border">
            {recentResponses.slice(0, 10).map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between px-4 py-3 text-sm"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={
                      r.correct ? "text-green-500" : "text-red-400"
                    }
                    aria-label={r.correct ? "Correct" : "Incorrect"}
                  >
                    {r.correct ? "✓" : "✗"}
                  </span>
                  <span>{r.problem.title}</span>
                  <span className="text-muted-foreground">
                    Step {r.stepIndex + 1}
                  </span>
                </div>
                <div className="text-muted-foreground">
                  {formatTimeAgo(r.createdAt)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Streak milestone toast */}
      <StreakMilestoneCheck streakCount={streak.current} />
    </main>
  );
}

function StatCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="border border-border rounded-lg p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{detail}</div>
    </div>
  );
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
