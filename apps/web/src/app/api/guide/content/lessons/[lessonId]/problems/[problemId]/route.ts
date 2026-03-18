import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { ensureGuide } from "@/lib/ensure-guide";

/**
 * PATCH /api/guide/content/lessons/[lessonId]/problems/[problemId]
 * Update a problem.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ lessonId: string; problemId: string }> }
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { guideProfile } = await ensureGuide(clerkId);
    const { lessonId, problemId } = await params;

    const problem = await db.problem.findUnique({
      where: { id: problemId },
      include: { lesson: { include: { module: { include: { course: true } } } } },
    });
    if (!problem || problem.lessonId !== lessonId) {
      return NextResponse.json({ error: "Problem not found" }, { status: 404 });
    }
    if (
      problem.lesson.module.course.authorId &&
      problem.lesson.module.course.authorId !== guideProfile.id
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { title, difficulty, content, kcIds } = body as {
      title?: string;
      difficulty?: number;
      content?: object;
      kcIds?: string[];
    };

    if (difficulty !== undefined && (difficulty < 1 || difficulty > 5)) {
      return NextResponse.json({ error: "Difficulty must be 1-5" }, { status: 400 });
    }

    const updated = await db.problem.update({
      where: { id: problemId },
      data: {
        ...(title !== undefined && { title: title.trim() }),
        ...(difficulty !== undefined && { difficulty }),
        ...(content !== undefined && { content }),
      },
    });

    // Update KC links if provided
    if (kcIds !== undefined) {
      await db.problemKC.deleteMany({ where: { problemId } });
      if (kcIds.length > 0) {
        await db.problemKC.createMany({
          data: kcIds.map((kcId) => ({ problemId, kcId })),
          skipDuplicates: true,
        });
      }
    }

    const result = await db.problem.findUnique({
      where: { id: problemId },
      include: { kcs: { include: { kc: true } } },
    });

    return NextResponse.json({ problem: result });
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw e;
  }
}

/**
 * DELETE /api/guide/content/lessons/[lessonId]/problems/[problemId]
 * Delete a problem.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ lessonId: string; problemId: string }> }
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { guideProfile } = await ensureGuide(clerkId);
    const { lessonId, problemId } = await params;

    const problem = await db.problem.findUnique({
      where: { id: problemId },
      include: { lesson: { include: { module: { include: { course: true } } } } },
    });
    if (!problem || problem.lessonId !== lessonId) {
      return NextResponse.json({ error: "Problem not found" }, { status: 404 });
    }
    if (
      problem.lesson.module.course.authorId &&
      problem.lesson.module.course.authorId !== guideProfile.id
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await db.problem.delete({ where: { id: problemId } });
    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw e;
  }
}
