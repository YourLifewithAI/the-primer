import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { ensureGuide } from "@/lib/ensure-guide";
import { getGuideClassrooms } from "@/lib/guide-analytics";

/**
 * GET /api/guide/classrooms
 * List all classrooms for the authenticated guide.
 *
 * POST /api/guide/classrooms
 * Create a new classroom.
 */
export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { guideProfile } = await ensureGuide(clerkId);
    const classrooms = await getGuideClassrooms(guideProfile.id);
    return NextResponse.json({ classrooms });
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden: Guide role required" }, { status: 403 });
    }
    throw e;
  }
}

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { guideProfile } = await ensureGuide(clerkId);
    const body = await req.json();
    const { name, description, courseId } = body as {
      name: string;
      description?: string;
      courseId?: string;
    };

    if (!name || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Classroom name is required" },
        { status: 400 }
      );
    }

    // Validate course exists if provided
    if (courseId) {
      const course = await db.course.findUnique({ where: { id: courseId } });
      if (!course) {
        return NextResponse.json(
          { error: "Course not found" },
          { status: 404 }
        );
      }
    }

    const classroom = await db.classroom.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        courseId: courseId || null,
        guideId: guideProfile.id,
      },
    });

    return NextResponse.json({ classroom }, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden: Guide role required" }, { status: 403 });
    }
    throw e;
  }
}
