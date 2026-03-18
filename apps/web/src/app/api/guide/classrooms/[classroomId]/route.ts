import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { ensureGuide } from "@/lib/ensure-guide";
import { getClassroomAnalytics } from "@/lib/guide-analytics";

/**
 * GET /api/guide/classrooms/[classroomId]
 * Get classroom details with full analytics.
 *
 * PATCH /api/guide/classrooms/[classroomId]
 * Update classroom details.
 *
 * DELETE /api/guide/classrooms/[classroomId]
 * Archive a classroom (soft delete).
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

    // Verify guide owns this classroom
    const classroom = await db.classroom.findUnique({
      where: { id: classroomId },
    });
    if (!classroom || classroom.guideId !== guideProfile.id) {
      return NextResponse.json({ error: "Classroom not found" }, { status: 404 });
    }

    const analytics = await getClassroomAnalytics(classroomId);

    // Log data access for FERPA compliance (batch insert)
    if (analytics.students.length > 0) {
      await db.dataAccessLog.createMany({
        data: analytics.students.map((student) => ({
          userId: guideProfile.userId,
          studentId: student.studentId,
          action: "view_mastery",
          details: { context: "guide_classroom_analytics", classroomId },
        })),
      });
    }

    return NextResponse.json(analytics);
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw e;
  }
}

export async function PATCH(
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
    const { name, description, courseId } = body as {
      name?: string;
      description?: string;
      courseId?: string | null;
    };

    if (name !== undefined && name.trim().length === 0) {
      return NextResponse.json(
        { error: "Classroom name cannot be empty" },
        { status: 400 }
      );
    }

    const updated = await db.classroom.update({
      where: { id: classroomId },
      data: {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(description !== undefined ? { description: description.trim() || null } : {}),
        ...(courseId !== undefined ? { courseId } : {}),
      },
    });

    return NextResponse.json({ classroom: updated });
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw e;
  }
}

export async function DELETE(
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

    // Soft delete: archive
    await db.classroom.update({
      where: { id: classroomId },
      data: { archived: true },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw e;
  }
}
