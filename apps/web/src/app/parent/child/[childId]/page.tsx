import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ensureParent, verifyChildAccess } from "@/lib/ensure-parent";
import { getChildDetail } from "@/lib/parent-analytics";
import { db } from "@/lib/db";
import { MASTERY_THRESHOLD } from "@primer/shared";
import { MasteryBar } from "@/components/mastery-bar";
import { ChildActivityFeed } from "@/components/parent/child-activity-feed";
import { TimeChart } from "@/components/parent/time-chart";

export const dynamic = "force-dynamic";

export default async function ChildDetailPage({
  params,
}: {
  params: Promise<{ childId: string }>;
}) {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in");

  let parentProfile;
  let user;
  try {
    const result = await ensureParent(clerkId);
    parentProfile = result.parentProfile;
    user = result.user;
  } catch {
    redirect("/dashboard");
  }

  const { childId } = await params;

  try {
    await verifyChildAccess(parentProfile, childId);
  } catch {
    redirect("/parent");
  }

  const detail = await getChildDetail(childId);

  // FERPA audit log
  await db.dataAccessLog.create({
    data: {
      userId: user.id,
      studentId: childId,
      action: "view_mastery",
      details: { context: "parent_child_detail_page" },
    },
  });

  // Struggling KCs
  const strugglingKCs = detail.masteryStates.filter(
    (ms) =>
      ms.pMastery < MASTERY_THRESHOLD &&
      ms.totalAttempts >= 5 &&
      ms.accuracy < 0.5
  );

  return (
    <main className="min-h-screen px-4 py-6 md:px-8 max-w-4xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-1 text-sm">
        <Link
          href="/parent"
          className="text-muted-foreground hover:text-foreground"
        >
          Parent Dashboard
        </Link>
        <span className="text-muted-foreground">/</span>
      </div>

      {/* Child header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">
            {detail.childName ?? "Unnamed Student"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {detail.gradeLevel && `Grade ${detail.gradeLevel}`}
          </p>
        </div>
        <Link
          href={`/parent/child/${childId}/report`}
          className="text-sm px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Weekly Report
        </Link>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Overall Mastery"
          value={`${Math.round(
            (detail.masteryStates.length > 0
              ? detail.masteryStates.reduce((s, ms) => s + ms.pMastery, 0) /
                detail.masteryStates.length
              : 0) * 100
          )}%`}
          detail={`${detail.masteryStates.filter((ms) => ms.isMastered).length} of ${detail.masteryStates.length} skills`}
        />
        <StatCard
          label="Practice Streak"
          value={`${detail.streak.current}`}
          detail={`${detail.streak.longest} day best`}
        />
        <StatCard
          label="Reviews Due"
          value={`${detail.fsrsStats.cardsDue}`}
          detail={`${detail.fsrsStats.totalCards} total cards`}
        />
        <StatCard
          label="Tutor Sessions"
          value={`${detail.tutorStats.sessionsThisWeek}`}
          detail={`${detail.tutorStats.totalSessions} total`}
        />
      </div>

      {/* Streak visualization */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">This Week</h2>
        <div className="flex items-center gap-2">
          {detail.streak.last7Days.map((active, i) => {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dayLabel = d.toLocaleDateString("en-US", { weekday: "short" });
            return (
              <div key={i} className="flex flex-col items-center gap-1">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs ${
                    active
                      ? "bg-green-500 text-white"
                      : "bg-border text-muted-foreground"
                  }`}
                >
                  {active ? "\u2713" : ""}
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {dayLabel}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Struggling KCs alert */}
      {strugglingKCs.length > 0 && (
        <div className="border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950 rounded-lg p-4 mb-8">
          <h3 className="font-medium text-amber-700 dark:text-amber-300 mb-2">
            Areas Needing Extra Practice ({strugglingKCs.length})
          </h3>
          <p className="text-sm text-amber-600 dark:text-amber-400 mb-3">
            Your child has been working hard on these topics. A little encouragement and extra
            practice can make a big difference.
          </p>
          <div className="space-y-2">
            {strugglingKCs.map((ms) => (
              <div
                key={ms.kcId}
                className="flex items-center justify-between text-sm"
              >
                <span className="font-medium">{ms.kcName}</span>
                <span className="text-muted-foreground">
                  {Math.round(ms.accuracy * 100)}% accuracy ({ms.totalAttempts}{" "}
                  attempts)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mastery by Subject */}
      {detail.masteryBySubject.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-4">Progress by Subject</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {detail.masteryBySubject.map((subj) => (
              <div
                key={subj.subject}
                className="border border-border rounded-lg p-4"
              >
                <div className="flex justify-between items-center mb-2">
                  <span className="font-medium text-sm">{subj.subject}</span>
                  <span className="text-xs text-muted-foreground">
                    {subj.masteredKCs}/{subj.totalKCs} mastered
                  </span>
                </div>
                <div className="h-2.5 bg-border rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      subj.averageMastery >= MASTERY_THRESHOLD
                        ? "bg-green-500"
                        : subj.averageMastery > 0.5
                          ? "bg-blue-500"
                          : "bg-amber-500"
                    }`}
                    style={{
                      width: `${Math.round(subj.averageMastery * 100)}%`,
                    }}
                  />
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {Math.round(subj.averageMastery * 100)}% average mastery
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* KC Mastery Detail */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-4">All Skills</h2>
        {detail.masteryStates.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No mastery data yet. Your child hasn&apos;t started practicing.
          </p>
        ) : (
          <div className="space-y-3">
            {detail.masteryStates
              .sort((a, b) => b.pMastery - a.pMastery)
              .map((ms) => (
                <MasteryBar
                  key={ms.kcId}
                  name={ms.kcName}
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

      {/* FSRS Review Stats */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-4">Spaced Repetition</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Cards Due"
            value={`${detail.fsrsStats.cardsDue}`}
            detail="ready for review"
          />
          <StatCard
            label="In Review"
            value={`${detail.fsrsStats.cardsInReview}`}
            detail="long-term memory"
          />
          <StatCard
            label="Learning"
            value={`${detail.fsrsStats.cardsInLearning}`}
            detail="still building recall"
          />
          <StatCard
            label="Lapses"
            value={`${detail.fsrsStats.totalLapses}`}
            detail="forgotten and relearned"
          />
        </div>
      </section>

      {/* Tutor Session Summary */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-4">AI Tutor Usage</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <StatCard
            label="Sessions This Week"
            value={`${detail.tutorStats.sessionsThisWeek}`}
            detail={`${detail.tutorStats.totalSessions} total`}
          />
          <StatCard
            label="Avg. Session"
            value={`${detail.tutorStats.averageSessionLength.toFixed(0)}m`}
            detail="minutes per session"
          />
          {detail.tutorStats.topTopics.length > 0 && (
            <div className="border border-border rounded-lg p-4">
              <div className="text-sm text-muted-foreground">Topics</div>
              <div className="mt-1 space-y-1">
                {detail.tutorStats.topTopics.map((topic) => (
                  <div key={topic} className="text-sm font-medium">
                    {topic}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Time Stats */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-4">Time Spent Learning</h2>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <StatCard
            label="This Week"
            value={`${Math.round(detail.timeStats.weeklyTotal)}m`}
            detail="total minutes"
          />
          <StatCard
            label="Daily Average"
            value={`${Math.round(detail.timeStats.dailyAverage)}m`}
            detail="minutes per day"
          />
        </div>
        {detail.timeStats.dailyMinutes.length > 0 && (
          <TimeChart data={detail.timeStats.dailyMinutes} />
        )}
      </section>

      {/* Recent Activity */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>
        <ChildActivityFeed
          activities={detail.recentActivity.map((a) => ({
            ...a,
            createdAt: a.createdAt.toISOString(),
          }))}
        />
      </section>
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
