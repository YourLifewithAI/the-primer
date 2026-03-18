import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ensureGuide } from "@/lib/ensure-guide";
import { getStudentDetail } from "@/lib/guide-analytics";
import { db } from "@/lib/db";
import { MASTERY_THRESHOLD } from "@primer/shared";
import { MasteryBar } from "@/components/mastery-bar";

export const dynamic = "force-dynamic";

export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in");

  let guideProfile;
  try {
    const result = await ensureGuide(clerkId);
    guideProfile = result.guideProfile;
  } catch {
    redirect("/dashboard");
  }

  const { studentId } = await params;

  // Verify guide has access to this student
  const membership = await db.classroomMembership.findFirst({
    where: {
      studentId,
      classroom: { guideId: guideProfile.id },
    },
    include: {
      classroom: { select: { id: true, name: true } },
    },
  });

  if (!membership) {
    redirect("/guide");
  }

  const detail = await getStudentDetail(studentId);

  // FERPA audit log
  await db.dataAccessLog.create({
    data: {
      userId: guideProfile.userId,
      studentId,
      action: "view_mastery",
      details: { context: "guide_student_detail_page" },
    },
  });

  // Compute struggling KCs
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
        <Link href="/guide" className="text-muted-foreground hover:text-foreground">
          Dashboard
        </Link>
        <span className="text-muted-foreground">/</span>
        <Link
          href={`/guide/classrooms/${membership.classroom.id}`}
          className="text-muted-foreground hover:text-foreground"
        >
          {membership.classroom.name}
        </Link>
        <span className="text-muted-foreground">/</span>
      </div>

      {/* Student header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">
            {detail.studentName ?? "Unnamed Student"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {detail.email}
            {detail.gradeLevel && ` · Grade ${detail.gradeLevel}`}
            {detail.enrolledAt &&
              ` · Enrolled ${new Date(detail.enrolledAt).toLocaleDateString()}`}
          </p>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Mastery"
          value={`${Math.round(detail.summary.averageMastery * 100)}%`}
          detail={`${detail.summary.masteredKCs} of ${detail.summary.totalKCs} skills`}
        />
        <StatCard
          label="Accuracy"
          value={`${Math.round(detail.summary.accuracy * 100)}%`}
          detail={`${detail.summary.totalAttempts} total attempts`}
        />
        <StatCard
          label="Avg Response"
          value={`${(detail.summary.averageResponseTime / 1000).toFixed(1)}s`}
          detail="per step"
        />
        <StatCard
          label="Avg Hints"
          value={detail.summary.averageHintsUsed.toFixed(1)}
          detail="per problem"
        />
      </div>

      {/* Struggling KCs alert */}
      {strugglingKCs.length > 0 && (
        <div className="border border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950 rounded-lg p-4 mb-8">
          <h3 className="font-medium text-red-700 dark:text-red-300 mb-2">
            Struggling Topics ({strugglingKCs.length})
          </h3>
          <p className="text-sm text-red-600 dark:text-red-400 mb-3">
            These skills have 5+ attempts with less than 50% accuracy. Consider targeted intervention.
          </p>
          <div className="space-y-2">
            {strugglingKCs.map((ms) => (
              <div
                key={ms.kcId}
                className="flex items-center justify-between text-sm"
              >
                <span className="font-medium">{ms.kcName}</span>
                <span className="text-muted-foreground">
                  {Math.round(ms.accuracy * 100)}% accuracy ({ms.totalAttempts} attempts)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* KC Mastery */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-4">Knowledge Components</h2>
        {detail.masteryStates.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No mastery data yet. This student hasn't started practicing.
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

      {/* Recent Activity */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>
        {detail.recentResponses.length === 0 ? (
          <p className="text-muted-foreground text-sm">No activity yet.</p>
        ) : (
          <div className="border border-border rounded-lg divide-y divide-border">
            {detail.recentResponses.slice(0, 20).map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between px-4 py-3 text-sm"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={r.correct ? "text-green-500" : "text-red-400"}
                  >
                    {r.correct ? "correct" : "incorrect"}
                  </span>
                  <span>{r.problemTitle}</span>
                  {r.hintsUsed > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {r.hintsUsed} hint{r.hintsUsed !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                <div className="text-muted-foreground text-xs">
                  {(r.responseTime / 1000).toFixed(1)}s ·{" "}
                  {formatTimeAgo(r.createdAt)}
                </div>
              </div>
            ))}
          </div>
        )}
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
