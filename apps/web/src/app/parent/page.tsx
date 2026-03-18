import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ensureParent } from "@/lib/ensure-parent";
import { getChildrenOverview } from "@/lib/parent-analytics";
import { db } from "@/lib/db";

export const metadata: Metadata = {
  title: "Parent Dashboard",
  description: "Monitor your children's learning progress and mastery.",
};

export const dynamic = "force-dynamic";

export default async function ParentDashboardPage() {
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

  const children = await getChildrenOverview(parentProfile.childIds);

  // FERPA audit log
  for (const child of children) {
    await db.dataAccessLog.create({
      data: {
        userId: user.id,
        studentId: child.childId,
        action: "view_overview",
        details: { context: "parent_dashboard_page" },
      },
    });
  }

  return (
    <main className="min-h-screen px-4 py-6 md:px-8 max-w-5xl mx-auto" role="main" aria-labelledby="parent-title">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 id="parent-title" className="text-2xl font-bold">Parent Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Monitor your children&apos;s learning progress
          </p>
        </div>
        <Link
          href="/parent/settings"
          className="text-sm px-4 py-2 rounded-lg border border-border hover:border-foreground/20 transition-colors"
        >
          Notification Settings
        </Link>
      </div>

      {children.length === 0 ? (
        <div className="border border-border rounded-lg p-8 text-center text-muted-foreground">
          <p className="text-lg mb-2">No children linked yet</p>
          <p className="text-sm">
            Contact your child&apos;s school or guide to link your account to your
            child&apos;s student profile.
          </p>
        </div>
      ) : (
        <>
          {/* Quick stats across all children */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <StatCard
              label="Children"
              value={`${children.length}`}
              detail={children.length === 1 ? "1 linked account" : `${children.length} linked accounts`}
            />
            <StatCard
              label="Total Skills Mastered"
              value={`${children.reduce((sum, c) => sum + c.masteredKCs, 0)}`}
              detail={`of ${children.reduce((sum, c) => sum + c.totalKCs, 0)} total`}
            />
            <StatCard
              label="Problems This Week"
              value={`${children.reduce((sum, c) => sum + c.problemsThisWeek, 0)}`}
              detail="across all children"
            />
            <StatCard
              label="Best Streak"
              value={`${Math.max(...children.map((c) => c.currentStreak), 0)}`}
              detail="consecutive days"
            />
          </div>

          {/* Children cards */}
          <section>
            <h2 className="text-lg font-semibold mb-4">Your Children</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {children.map((child) => (
                <Link
                  key={child.childId}
                  href={`/parent/child/${child.childId}`}
                  className="border border-border rounded-lg p-5 hover:border-foreground/20 transition-colors block"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-medium">
                        {child.childName ?? "Unnamed Student"}
                      </h3>
                      {child.gradeLevel && (
                        <p className="text-sm text-muted-foreground mt-0.5">
                          Grade {child.gradeLevel}
                        </p>
                      )}
                    </div>
                    {child.currentStreak > 0 && (
                      <span className="text-xs bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 px-2 py-1 rounded">
                        {child.currentStreak} day streak
                      </span>
                    )}
                  </div>

                  {/* Mastery progress bar */}
                  <div className="mb-3">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>
                        {child.masteredKCs} of {child.totalKCs} skills mastered
                      </span>
                      <span>{Math.round(child.averageMastery * 100)}%</span>
                    </div>
                    <div className="h-2 bg-border rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-500 rounded-full transition-all"
                        style={{
                          width: `${Math.round(child.averageMastery * 100)}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>{child.problemsThisWeek} problems this week</span>
                    {child.lastActiveAt && (
                      <span>
                        Last active {formatTimeAgo(child.lastActiveAt)}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        </>
      )}
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
