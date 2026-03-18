import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { ensureGuide } from "@/lib/ensure-guide";
import { db } from "@/lib/db";
import { LessonEditor } from "@/components/guide/content/lesson-editor";

export const dynamic = "force-dynamic";

export default async function EditLessonPage({
  params,
}: {
  params: Promise<{ lessonId: string }>;
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

  const { lessonId } = await params;

  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    include: {
      module: {
        include: {
          course: { select: { id: true, title: true, authorId: true } },
        },
      },
      problems: {
        orderBy: { orderIndex: "asc" },
        include: {
          kcs: {
            include: {
              kc: { select: { id: true, name: true, subject: true, gradeLevel: true } },
            },
          },
        },
      },
    },
  });

  if (!lesson) notFound();

  const isOwner =
    lesson.module.course.authorId === guideProfile.id ||
    lesson.module.course.authorId === null;

  // Get available KCs for the step editor
  const kcs = await db.knowledgeComponent.findMany({
    select: { id: true, name: true, subject: true, gradeLevel: true },
    orderBy: { name: "asc" },
  });

  // Serialize problems to match the expected interface (JsonValue -> Record)
  const serializedLesson = {
    ...lesson,
    problems: lesson.problems.map((p) => ({
      ...p,
      content: (p.content ?? {}) as Record<string, unknown>,
    })),
  };

  return (
    <main className="min-h-screen px-4 py-6 md:px-8 max-w-5xl mx-auto">
      <LessonEditor
        lesson={serializedLesson}
        courseId={lesson.module.course.id}
        courseTitle={lesson.module.course.title}
        moduleName={lesson.module.title}
        availableKCs={kcs}
        isOwner={isOwner}
      />
    </main>
  );
}
