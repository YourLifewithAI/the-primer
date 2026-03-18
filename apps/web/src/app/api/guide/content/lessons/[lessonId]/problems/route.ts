import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { ensureGuide } from "@/lib/ensure-guide";

/**
 * POST /api/guide/content/lessons/[lessonId]/problems
 * Create a new problem within a lesson.
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

    // Verify lesson access
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
    const { title, difficulty, context, steps, kcIds } = body as {
      title: string;
      difficulty: number;
      context?: string;
      steps: Array<{
        id: string;
        prompt: string;
        correctAnswer: string;
        acceptableFormats?: string[];
        kcs: string[];
        hints: Array<{ type: string; content: string }>;
        explanation?: string;
      }>;
      kcIds: string[];
    };

    if (!title?.trim()) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }
    if (!steps?.length) {
      return NextResponse.json({ error: "At least one step is required" }, { status: 400 });
    }
    if (difficulty < 1 || difficulty > 5) {
      return NextResponse.json({ error: "Difficulty must be 1-5" }, { status: 400 });
    }

    // Get next orderIndex
    const maxOrder = await db.problem.aggregate({
      where: { lessonId },
      _max: { orderIndex: true },
    });
    const nextIndex = (maxOrder._max.orderIndex ?? -1) + 1;

    // Build the problem content JSON (same format as seed data)
    const problemContent = {
      id: `prob_${Date.now()}`,
      title: title.trim(),
      difficulty,
      context: context?.trim() || undefined,
      steps,
    };

    const problem = await db.problem.create({
      data: {
        title: title.trim(),
        difficulty,
        content: problemContent,
        orderIndex: nextIndex,
        lessonId,
      },
    });

    // Link KCs
    if (kcIds?.length) {
      await db.problemKC.createMany({
        data: kcIds.map((kcId) => ({ problemId: problem.id, kcId })),
        skipDuplicates: true,
      });
    }

    const created = await db.problem.findUnique({
      where: { id: problem.id },
      include: { kcs: { include: { kc: true } } },
    });

    return NextResponse.json({ problem: created }, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw e;
  }
}
