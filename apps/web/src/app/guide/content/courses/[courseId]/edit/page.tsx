import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { ensureGuide } from "@/lib/ensure-guide";
import { db } from "@/lib/db";
import { CourseEditor } from "@/components/guide/content/course-editor";

export const dynamic = "force-dynamic";

export default async function EditCoursePage({
  params,
}: {
  params: Promise<{ courseId: string }>;
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

  const { courseId } = await params;

  const course = await db.course.findUnique({
    where: { id: courseId },
    include: {
      modules: {
        orderBy: { orderIndex: "asc" },
        include: {
          lessons: {
            orderBy: { orderIndex: "asc" },
            include: {
              _count: { select: { problems: true } },
            },
          },
        },
      },
    },
  });

  if (!course) notFound();

  // Check access: must be author or seed content
  const isOwner = course.authorId === guideProfile.id || course.authorId === null;

  return (
    <main className="min-h-screen px-4 py-6 md:px-8 max-w-4xl mx-auto">
      <CourseEditor course={course} isOwner={isOwner} />
    </main>
  );
}
