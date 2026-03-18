import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { ensureGuide } from "@/lib/ensure-guide";

/**
 * POST /api/guide/content/courses/[courseId]/modules
 * Add a new module to a course.
 */
export async function POST(
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
      return NextResponse.json({ error: "Only the author can add modules" }, { status: 403 });
    }

    const body = await req.json();
    const { title } = body as { title: string };

    if (!title?.trim()) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    // Get next orderIndex
    const maxOrder = await db.module.aggregate({
      where: { courseId },
      _max: { orderIndex: true },
    });
    const nextIndex = (maxOrder._max.orderIndex ?? -1) + 1;

    const mod = await db.module.create({
      data: {
        title: title.trim(),
        orderIndex: nextIndex,
        courseId,
      },
    });

    return NextResponse.json({ module: mod }, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw e;
  }
}
