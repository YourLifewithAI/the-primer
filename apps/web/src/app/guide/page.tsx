import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ensureGuide } from "@/lib/ensure-guide";
import { getGuideClassrooms } from "@/lib/guide-analytics";
import { db } from "@/lib/db";

export const metadata: Metadata = {
  title: "Guide Dashboard",
  description: "Manage classrooms and monitor student progress.",
};

export const dynamic = "force-dynamic";

export default async function GuideDashboardPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in");

  let guideProfile;
  try {
    const result = await ensureGuide(clerkId);
    guideProfile = result.guideProfile;
  } catch {
    redirect("/dashboard");
  }

  const classrooms = await getGuideClassrooms(guideProfile.id);

  // Get quick stats across all classrooms (single query instead of N+1)
  const classroomIds = classrooms.map((c) => c.id);
  const allMembers = classroomIds.length > 0
    ? await db.classroomMembership.findMany({
        where: { classroomId: { in: classroomIds } },
        select: { studentId: true },
      })
    : [];
  const allStudentIds = new Set<string>(allMembers.map((m) => m.studentId));

  const totalStudents = allStudentIds.size;

  // Recent activity across all students
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const activeToday = allStudentIds.size > 0
    ? await db.problemResponse.groupBy({
        by: ["studentId"],
        where: {
          studentId: { in: [...allStudentIds] },
          createdAt: { gte: oneDayAgo },
        },
      })
    : [];

  return (
    <main className="min-h-screen px-4 py-6 md:px-8 max-w-5xl mx-auto" role="main" aria-labelledby="guide-title">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 id="guide-title" className="text-2xl font-bold">Guide Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Manage your classrooms and monitor student progress
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/guide/content"
            className="text-sm px-4 py-2 rounded-lg border border-border hover:bg-accent transition-colors"
          >
            Content Library
          </Link>
          <Link
            href="/guide/classrooms/new"
            className="text-sm px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            New Classroom
          </Link>
        </div>
      </div>

      {/* Overview stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Classrooms"
          value={`${classrooms.length}`}
          detail={classrooms.length === 1 ? "1 active" : `${classrooms.length} active`}
        />
        <StatCard
          label="Total Students"
          value={`${totalStudents}`}
          detail="across all classrooms"
        />
        <StatCard
          label="Active Today"
          value={`${activeToday.length}`}
          detail={`of ${totalStudents} students`}
        />
        <StatCard
          label="Needs Attention"
          value={`${totalStudents - activeToday.length}`}
          detail="inactive today"
        />
      </div>

      {/* Classrooms list */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Your Classrooms</h2>
        {classrooms.length === 0 ? (
          <div className="border border-border rounded-lg p-8 text-center text-muted-foreground">
            <p className="text-lg mb-2">No classrooms yet</p>
            <p className="text-sm mb-4">
              Create your first classroom to start tracking student progress.
            </p>
            <Link
              href="/guide/classrooms/new"
              className="text-primary hover:underline text-sm"
            >
              Create Classroom
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {classrooms.map((classroom) => (
              <Link
                key={classroom.id}
                href={`/guide/classrooms/${classroom.id}`}
                className="border border-border rounded-lg p-5 hover:border-foreground/20 transition-colors block"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-medium">{classroom.name}</h3>
                    {classroom.description && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {classroom.description}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground bg-border/50 px-2 py-1 rounded">
                    {classroom.studentCount} student{classroom.studentCount !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  {classroom.courseTitle && (
                    <span>Course: {classroom.courseTitle}</span>
                  )}
                  <span>
                    {classroom.assignmentCount} assignment{classroom.assignmentCount !== 1 ? "s" : ""}
                  </span>
                  <span className="font-mono text-[10px]">
                    Join: {classroom.joinCode.slice(0, 8)}
                  </span>
                </div>
              </Link>
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
