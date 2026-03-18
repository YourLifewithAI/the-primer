import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { ensureGuide } from "@/lib/ensure-guide";

/**
 * GET /api/guide/content/lessons/[lessonId]
 * Get a lesson with all its problems (steps, hints, KCs).
 */
export async function GET(
  _req: NextRequest,
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
      include: {
        module: {
          include: { course: true },
        },
        problems: {
          orderBy: { orderIndex: "asc" },
          include: {
            kcs: {
              include: { kc: true },
            },
          },
        },
      },
    });

    if (!lesson) {
      return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
    }

    // Access check: author, shared course, or seed content
    const course = lesson.module.course;
    if (course.authorId && course.authorId !== guideProfile.id && !course.isShared) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ lesson });
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw e;
  }
}

/**
 * PATCH /api/guide/content/lessons/[lessonId]
 * Update lesson metadata (title, content, status).
 */
export async function PATCH(
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
      return NextResponse.json({ error: "Only the course author can edit lessons" }, { status: 403 });
    }

    const body = await req.json();
    const { title, content, status } = body as {
      title?: string;
      content?: string;
      status?: "DRAFT" | "PUBLISHED" | "ARCHIVED";
    };

    const updated = await db.lesson.update({
      where: { id: lessonId },
      data: {
        ...(title !== undefined && { title: title.trim() }),
        ...(content !== undefined && { content: content.trim() || null }),
        ...(status !== undefined && { status }),
      },
    });

    return NextResponse.json({ lesson: updated });
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw e;
  }
}

/**
 * DELETE /api/guide/content/lessons/[lessonId]
 * Delete a lesson.
 */
export async function DELETE(
  _req: NextRequest,
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
      return NextResponse.json({ error: "Only the course author can delete lessons" }, { status: 403 });
    }

    await db.lesson.delete({ where: { id: lessonId } });
    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw e;
  }
}
