import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ensureGuide } from "@/lib/ensure-guide";
import { db } from "@/lib/db";
import { CreateLessonForm } from "@/components/guide/content/create-lesson-form";

export const dynamic = "force-dynamic";

export default async function NewLessonPage({
  searchParams,
}: {
  searchParams: Promise<{ moduleId?: string; courseId?: string }>;
}) {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in");

  try {
    await ensureGuide(clerkId);
  } catch {
    redirect("/dashboard");
  }

  const { moduleId, courseId } = await searchParams;

  // Get module info if provided
  let moduleName: string | null = null;
  if (moduleId) {
    const mod = await db.module.findUnique({
      where: { id: moduleId },
      select: { title: true },
    });
    moduleName = mod?.title ?? null;
  }

  return (
    <main className="min-h-screen px-4 py-6 md:px-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Create New Lesson</h1>
      {moduleName && (
        <p className="text-sm text-muted-foreground mb-6">
          In module: {moduleName}
        </p>
      )}
      <CreateLessonForm moduleId={moduleId ?? ""} courseId={courseId ?? ""} />
    </main>
  );
}
