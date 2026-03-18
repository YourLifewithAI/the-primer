import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ensureGuide } from "@/lib/ensure-guide";
import { db } from "@/lib/db";
import { CreateClassroomForm } from "@/components/guide/create-classroom-form";

export const dynamic = "force-dynamic";

export default async function NewClassroomPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in");

  try {
    await ensureGuide(clerkId);
  } catch {
    redirect("/dashboard");
  }

  // Get available courses for the dropdown
  const courses = await db.course.findMany({
    where: { published: true },
    select: { id: true, title: true, subject: true },
    orderBy: { title: "asc" },
  });

  return (
    <main className="min-h-screen px-4 py-6 md:px-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Create Classroom</h1>
      <CreateClassroomForm courses={courses} />
    </main>
  );
}
