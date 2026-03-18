import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { ensureGuide } from "@/lib/ensure-guide";

/**
 * GET /api/guide/content/courses/[courseId]
 * Get a single course with modules and lessons.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ courseId: string }> }
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { guideProfile } = await ensureGuide(clerkId);
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
        author: { include: { user: { select: { name: true } } } },
      },
    });

    if (!course) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }

    // Check access: author, shared, or seed content
    if (course.authorId && course.authorId !== guideProfile.id && !course.isShared) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ course });
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw e;
  }
}

/**
 * PATCH /api/guide/content/courses/[courseId]
 * Update course metadata.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ courseId: string }> }
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { guideProfile } = await ensureGuide(clerkId);
    const { courseId } = await params;

    const course = await db.course.findUnique({ where: { id: courseId } });
    if (!course) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }
    if (course.authorId && course.authorId !== guideProfile.id) {
      return NextResponse.json({ error: "Only the author can edit this course" }, { status: 403 });
    }

    const body = await req.json();
    const { title, description, subject, gradeLevels, isShared, published } = body as {
      title?: string;
      description?: string;
      subject?: string;
      gradeLevels?: number[];
      isShared?: boolean;
      published?: boolean;
    };

    const updated = await db.course.update({
      where: { id: courseId },
      data: {
        ...(title !== undefined && { title: title.trim() }),
        ...(description !== undefined && { description: description.trim() || null }),
        ...(subject !== undefined && { subject: subject as "MATH" | "SCIENCE" | "ELA" | "SOCIAL_STUDIES" }),
        ...(gradeLevels !== undefined && { gradeLevel: gradeLevels }),
        ...(isShared !== undefined && { isShared }),
        ...(published !== undefined && { published }),
      },
    });

    return NextResponse.json({ course: updated });
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw e;
  }
}

/**
 * DELETE /api/guide/content/courses/[courseId]
 * Delete a course (only if authored by this guide).
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ courseId: string }> }
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { guideProfile } = await ensureGuide(clerkId);
    const { courseId } = await params;

    const course = await db.course.findUnique({ where: { id: courseId } });
    if (!course) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }
    if (course.authorId && course.authorId !== guideProfile.id) {
      return NextResponse.json({ error: "Only the author can delete this course" }, { status: 403 });
    }

    await db.course.delete({ where: { id: courseId } });
    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw e;
  }
}
