import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ensureGuide } from "@/lib/ensure-guide";
import { getClassroomAnalytics } from "@/lib/guide-analytics";
import { db } from "@/lib/db";
import { MASTERY_THRESHOLD } from "@primer/shared";
import { StudentTable } from "@/components/guide/student-table";
import { KCHeatmap } from "@/components/guide/kc-heatmap";
import { AddStudentForm } from "@/components/guide/add-student-form";
import { CreateAssignmentForm } from "@/components/guide/create-assignment-form";

export const dynamic = "force-dynamic";

export default async function ClassroomDetailPage({
  params,
}: {
  params: Promise<{ classroomId: string }>;
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

  const { classroomId } = await params;

  // Verify ownership
  const classroom = await db.classroom.findUnique({
    where: { id: classroomId },
    include: {
      course: {
        select: {
          id: true,
          title: true,
          modules: {
            include: {
              lessons: {
                select: { id: true, title: true },
                orderBy: { orderIndex: "asc" },
              },
            },
            orderBy: { orderIndex: "asc" },
          },
        },
      },
      assignments: {
        include: {
          lesson: { select: { id: true, title: true } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!classroom || classroom.guideId !== guideProfile.id) {
    redirect("/guide");
  }

  const analytics = await getClassroomAnalytics(classroomId);

  // Build lessons list for assignment creation
  const lessons = classroom.course?.modules.flatMap((m) =>
    m.lessons.map((l) => ({ id: l.id, title: l.title }))
  ) ?? [];

  return (
    <main className="min-h-screen px-4 py-6 md:px-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/guide"
              className="text-muted-foreground hover:text-foreground text-sm"
            >
              Dashboard
            </Link>
            <span className="text-muted-foreground">/</span>
          </div>
          <h1 className="text-2xl font-bold">{classroom.name}</h1>
          {classroom.description && (
            <p className="text-muted-foreground mt-1">{classroom.description}</p>
          )}
          {classroom.course && (
            <p className="text-sm text-muted-foreground mt-1">
              Course: {classroom.course.title}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Join Code</div>
            <code className="text-sm font-mono bg-border/50 px-2 py-0.5 rounded">
              {classroom.joinCode.slice(0, 8)}
            </code>
          </div>
        </div>
      </div>

      {/* Overview stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Students"
          value={`${analytics.studentCount}`}
          detail={`${analytics.strugglingCount} struggling`}
        />
        <StatCard
          label="Class Mastery"
          value={`${Math.round(analytics.averageClassMastery * 100)}%`}
          detail={`${MASTERY_THRESHOLD * 100}% threshold`}
        />
        <StatCard
          label="Struggling"
          value={`${analytics.strugglingCount}`}
          detail={analytics.strugglingCount > 0 ? "need attention" : "none right now"}
          highlight={analytics.strugglingCount > 0}
        />
        <StatCard
          label="Idle"
          value={`${analytics.idleCount}`}
          detail={analytics.idleCount > 0 ? "inactive 3+ days" : "all engaged"}
          highlight={analytics.idleCount > 0}
        />
      </div>

      {/* Students table */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Students</h2>
        </div>
        {analytics.students.length === 0 ? (
          <div className="border border-border rounded-lg p-8 text-center text-muted-foreground">
            <p className="mb-2">No students in this classroom yet.</p>
            <p className="text-sm">Add students using the form below.</p>
          </div>
        ) : (
          <StudentTable
            students={analytics.students.map((s) => ({
              ...s,
              lastActiveAt: s.lastActiveAt?.toISOString() ?? null,
            }))}
          />
        )}
        <div className="mt-4">
          <AddStudentForm classroomId={classroomId} />
        </div>
      </section>

      {/* KC Heatmap */}
      {analytics.kcHeatmap.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-4">Knowledge Component Heatmap</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Red indicates topics where students are struggling. Focus instruction here.
          </p>
          <KCHeatmap entries={analytics.kcHeatmap} />
        </section>
      )}

      {/* Assignments */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-4">Assignments</h2>
        {classroom.assignments.length > 0 && (
          <div className="border border-border rounded-lg divide-y divide-border mb-4">
            {classroom.assignments.map((a) => (
              <div key={a.id} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm">{a.title}</div>
                  {a.lesson && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Lesson: {a.lesson.title}
                    </div>
                  )}
                  {a.description && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {a.description}
                    </div>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {a.dueDate
                    ? `Due: ${new Date(a.dueDate).toLocaleDateString()}`
                    : "No due date"}
                </div>
              </div>
            ))}
          </div>
        )}
        <CreateAssignmentForm
          classroomId={classroomId}
          lessons={lessons}
        />
      </section>
    </main>
  );
}

function StatCard({
  label,
  value,
  detail,
  highlight = false,
}: {
  label: string;
  value: string;
  detail: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`border rounded-lg p-4 ${
        highlight ? "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950" : "border-border"
      }`}
    >
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${highlight ? "text-red-600 dark:text-red-400" : ""}`}>
        {value}
      </div>
      <div className="text-xs text-muted-foreground mt-1">{detail}</div>
    </div>
  );
}
