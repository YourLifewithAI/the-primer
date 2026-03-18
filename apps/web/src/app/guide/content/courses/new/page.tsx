import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ensureGuide } from "@/lib/ensure-guide";
import { CreateCourseForm } from "@/components/guide/content/create-course-form";

export const dynamic = "force-dynamic";

export default async function NewCoursePage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in");

  try {
    await ensureGuide(clerkId);
  } catch {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen px-4 py-6 md:px-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Create New Course</h1>
      <CreateCourseForm />
    </main>
  );
}
