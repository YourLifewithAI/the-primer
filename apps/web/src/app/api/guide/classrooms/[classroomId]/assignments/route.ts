import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { ensureGuide } from "@/lib/ensure-guide";
import { notifyAssignmentCreated } from "@/lib/notifications";

/**
 * GET /api/guide/classrooms/[classroomId]/assignments
 * List assignments for a classroom.
 *
 * POST /api/guide/classrooms/[classroomId]/assignments
 * Create a new assignment.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ classroomId: string }> }
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { guideProfile } = await ensureGuide(clerkId);
    const { classroomId } = await params;

    const classroom = await db.classroom.findUnique({
      where: { id: classroomId },
    });
    if (!classroom || classroom.guideId !== guideProfile.id) {
      return NextResponse.json({ error: "Classroom not found" }, { status: 404 });
    }

    const assignments = await db.assignment.findMany({
      where: { classroomId },
      include: {
        lesson: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ assignments });
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw e;
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ classroomId: string }> }
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { guideProfile } = await ensureGuide(clerkId);
    const { classroomId } = await params;

    const classroom = await db.classroom.findUnique({
      where: { id: classroomId },
    });
    if (!classroom || classroom.guideId !== guideProfile.id) {
      return NextResponse.json({ error: "Classroom not found" }, { status: 404 });
    }

    const body = await req.json();
    const { title, description, lessonId, kcIds, dueDate } = body as {
      title: string;
      description?: string;
      lessonId?: string;
      kcIds?: string[];
      dueDate?: string;
    };

    if (!title || title.trim().length === 0) {
      return NextResponse.json(
        { error: "Assignment title is required" },
        { status: 400 }
      );
    }

    const assignment = await db.assignment.create({
      data: {
        classroomId,
        title: title.trim(),
        description: description?.trim() || null,
        lessonId: lessonId || null,
        kcIds: kcIds ?? [],
        dueDate: dueDate ? new Date(dueDate) : null,
      },
      include: {
        lesson: { select: { id: true, title: true } },
      },
    });

    // Notify classroom students asynchronously
    notifyAssignmentCreated(
      classroomId,
      classroom.name,
      assignment.title,
      assignment.dueDate
    ).catch(() => {});

    return NextResponse.json({ assignment }, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw e;
  }
}
