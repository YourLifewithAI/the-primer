import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { ensureGuide } from "@/lib/ensure-guide";

/**
 * POST /api/guide/content/lessons/[lessonId]/problems/reorder
 * Reorder problems within a lesson.
 * Body: { problemIds: string[] } — new order
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> }
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { guideProfile } = await ensureGuide(clerkId);
    const { lessonId } = await params;

    const lesson = await db.lesson.findUnique({
      where: { id: lessonId },
      include: { module: { include: { course: true } } },
    });
    if (!lesson) {
      return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
    }
    if (lesson.module.course.authorId && lesson.module.course.authorId !== guideProfile.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { problemIds } = body as { problemIds: string[] };

    if (!problemIds?.length) {
      return NextResponse.json({ error: "problemIds array is required" }, { status: 400 });
    }

    // Verify all problem IDs belong to this lesson
    const existingProblems = await db.problem.findMany({
      where: { lessonId },
      select: { id: true },
    });
    const existingIds = new Set(existingProblems.map((p) => p.id));
    const invalidIds = problemIds.filter((id) => !existingIds.has(id));
    if (invalidIds.length > 0) {
      return NextResponse.json(
        { error: `Problem IDs do not belong to this lesson: ${invalidIds.join(", ")}` },
        { status: 400 }
      );
    }

    // Use a transaction to update all orderIndex values
    // First set all to negative to avoid unique constraint violations
    await db.$transaction(async (tx) => {
      // Temporarily set to negative values
      for (let i = 0; i < problemIds.length; i++) {
        await tx.problem.update({
          where: { id: problemIds[i] },
          data: { orderIndex: -(i + 1) },
        });
      }
      // Now set to correct positive values
      for (let i = 0; i < problemIds.length; i++) {
        await tx.problem.update({
          where: { id: problemIds[i] },
          data: { orderIndex: i },
        });
      }
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw e;
  }
}
