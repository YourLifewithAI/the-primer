import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { ensureGuide } from "@/lib/ensure-guide";

/**
 * POST /api/guide/content/lessons
 * Create a new lesson within a module.
 */
export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { guideProfile } = await ensureGuide(clerkId);
    const body = await req.json();
    const { title, content, moduleId, status } = body as {
      title: string;
      content?: string;
      moduleId: string;
      status?: "DRAFT" | "PUBLISHED";
    };

    if (!title?.trim()) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }
    if (!moduleId) {
      return NextResponse.json({ error: "Module ID is required" }, { status: 400 });
    }

    // Verify the module exists and the guide owns the course
    const mod = await db.module.findUnique({
      where: { id: moduleId },
      include: { course: true },
    });
    if (!mod) {
      return NextResponse.json({ error: "Module not found" }, { status: 404 });
    }
    if (mod.course.authorId && mod.course.authorId !== guideProfile.id) {
      return NextResponse.json({ error: "You can only add lessons to your own courses" }, { status: 403 });
    }

    // Get next orderIndex
    const maxOrder = await db.lesson.aggregate({
      where: { moduleId },
      _max: { orderIndex: true },
    });
    const nextIndex = (maxOrder._max.orderIndex ?? -1) + 1;

    const lesson = await db.lesson.create({
      data: {
        title: title.trim(),
        content: content?.trim() || null,
        moduleId,
        orderIndex: nextIndex,
        status: status ?? "DRAFT",
        authorId: guideProfile.id,
      },
    });

    return NextResponse.json({ lesson }, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw e;
  }
}
