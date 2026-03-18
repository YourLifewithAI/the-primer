import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ensureUser } from "@/lib/ensure-user";
import { generatePlaylist } from "@/lib/playlist";
import { getStreak } from "@/lib/streaks";
import { db } from "@/lib/db";
import { CheckChart } from "@/components/check-chart";
import { StreakDisplay } from "@/components/streak-display";
import { SessionTimer } from "@/components/session-timer";

export const metadata: Metadata = {
  title: "My Playlist",
  description: "Your personalized adaptive learning playlist.",
};

export const dynamic = "force-dynamic";

export default async function LearnPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in");

  const user = await ensureUser(clerkId);

  // Get the student's first enrolled course
  const enrollment = await db.enrollment.findFirst({
    where: { studentId: user.id },
    include: { course: true },
  });

  if (!enrollment) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-8" aria-labelledby="learn-title">
        <div className="border border-border rounded-lg p-8 text-center">
          <h1 id="learn-title" className="text-xl font-semibold mb-2">No Course Enrolled</h1>
          <p className="text-muted-foreground mb-4">
            You need to be enrolled in a course to see your playlist.
          </p>
          <a
            href="/courses"
            className="text-primary hover:underline text-sm"
          >
            Browse Courses
          </a>
        </div>
      </main>
    );
  }

  const [{ playlist, stats }, streak] = await Promise.all([
    generatePlaylist(user.id, enrollment.courseId),
    getStreak(user.id),
  ]);

  return (
    <main className="max-w-2xl mx-auto px-4 py-8" aria-label="Learning playlist">
      {/* Session header: streak + timer */}
      <div className="flex items-center justify-between mb-6">
        <StreakDisplay
          current={streak.current}
          last7Days={streak.last7Days}
        />
        <SessionTimer />
      </div>

      <CheckChart
        playlist={playlist}
        stats={stats}
        studentName={user.name}
        courseId={enrollment.courseId}
      />
    </main>
  );
}
