import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ensureGuide } from "@/lib/ensure-guide";
import { db } from "@/lib/db";

export const metadata: Metadata = {
  title: "Content Library",
  description: "Create and manage courses, lessons, and problems.",
};

export const dynamic = "force-dynamic";

export default async function ContentLibraryPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in");

  let guideProfile;
  try {
    const result = await ensureGuide(clerkId);
    guideProfile = result.guideProfile;
  } catch {
    redirect("/dashboard");
  }

  const courses = await db.course.findMany({
    where: {
      OR: [
        { authorId: guideProfile.id },
        { isShared: true },
        { authorId: null },
      ],
    },
    include: {
      modules: {
        include: {
          _count: { select: { lessons: true } },
        },
      },
      _count: { select: { enrollments: true } },
      author: { include: { user: { select: { name: true } } } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const myCourses = courses.filter((c) => c.authorId === guideProfile.id);
  const sharedCourses = courses.filter((c) => c.authorId !== guideProfile.id);

  return (
    <main className="min-h-screen px-4 py-6 md:px-8 max-w-5xl mx-auto" role="main" aria-labelledby="content-title">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 id="content-title" className="text-2xl font-bold">Content Library</h1>
          <p className="text-muted-foreground mt-1">
            Create and manage courses, lessons, and problems
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/guide/content/kcs"
            className="text-sm px-4 py-2 rounded-lg border border-border hover:bg-accent transition-colors"
          >
            Manage KCs
          </Link>
          <Link
            href="/guide/content/courses/new"
            className="text-sm px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            New Course
          </Link>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Link
          href="/guide/content/courses/new"
          className="border border-dashed border-border rounded-lg p-4 hover:border-foreground/30 transition-colors text-center"
        >
          <div className="text-lg mb-1">+</div>
          <div className="text-sm font-medium">Create Course</div>
          <div className="text-xs text-muted-foreground">Start from scratch</div>
        </Link>
        <Link
          href="/guide/content/import"
          className="border border-dashed border-border rounded-lg p-4 hover:border-foreground/30 transition-colors text-center"
        >
          <div className="text-lg mb-1">&uarr;</div>
          <div className="text-sm font-medium">Import Content</div>
          <div className="text-xs text-muted-foreground">Upload JSON (OATutor format)</div>
        </Link>
        <Link
          href="/guide/content/kcs"
          className="border border-dashed border-border rounded-lg p-4 hover:border-foreground/30 transition-colors text-center"
        >
          <div className="text-lg mb-1">&loz;</div>
          <div className="text-sm font-medium">Knowledge Components</div>
          <div className="text-xs text-muted-foreground">Browse and create KCs</div>
        </Link>
      </div>

      {/* My Courses */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-4">My Courses</h2>
        {myCourses.length === 0 ? (
          <div className="border border-border rounded-lg p-8 text-center text-muted-foreground">
            <p className="mb-2">You haven&apos;t created any courses yet.</p>
            <Link href="/guide/content/courses/new" className="text-primary hover:underline text-sm">
              Create your first course
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {myCourses.map((course) => (
              <CourseCard key={course.id} course={course} isOwner />
            ))}
          </div>
        )}
      </section>

      {/* Shared / Seed Courses */}
      {sharedCourses.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-4">Shared Content</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {sharedCourses.map((course) => (
              <CourseCard key={course.id} course={course} isOwner={false} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

interface CourseWithRelations {
  id: string;
  title: string;
  description: string | null;
  subject: string;
  gradeLevel: number[];
  published: boolean;
  isShared: boolean;
  modules: Array<{ _count: { lessons: number } }>;
  _count: { enrollments: number };
  author: { user: { name: string | null } } | null;
}

function CourseCard({
  course,
  isOwner,
}: {
  course: CourseWithRelations;
  isOwner: boolean;
}) {
  const totalLessons = course.modules.reduce(
    (sum, m) => sum + m._count.lessons,
    0
  );

  return (
    <Link
      href={isOwner ? `/guide/content/courses/${course.id}/edit` : `/guide/content/courses/${course.id}/edit`}
      className="border border-border rounded-lg p-5 hover:border-foreground/20 transition-colors block"
    >
      <div className="flex items-start justify-between mb-2">
        <h3 className="font-medium">{course.title}</h3>
        <div className="flex gap-1">
          {course.published ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
              Published
            </span>
          ) : (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
              Draft
            </span>
          )}
          {course.isShared && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
              Shared
            </span>
          )}
        </div>
      </div>
      {course.description && (
        <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
          {course.description}
        </p>
      )}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>{course.subject}</span>
        <span>Grade {course.gradeLevel.join(", ")}</span>
        <span>
          {course.modules.length} module{course.modules.length !== 1 ? "s" : ""}
        </span>
        <span>
          {totalLessons} lesson{totalLessons !== 1 ? "s" : ""}
        </span>
        {!isOwner && course.author?.user.name && (
          <span>by {course.author.user.name}</span>
        )}
      </div>
    </Link>
  );
}
