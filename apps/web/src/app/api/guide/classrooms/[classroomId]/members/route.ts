import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { ensureGuide } from "@/lib/ensure-guide";

/**
 * POST /api/guide/classrooms/[classroomId]/members
 * Add a student to a classroom by email or student ID.
 *
 * DELETE /api/guide/classrooms/[classroomId]/members
 * Remove a student from a classroom.
 */
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

    // Verify ownership
    const classroom = await db.classroom.findUnique({
      where: { id: classroomId },
    });
    if (!classroom || classroom.guideId !== guideProfile.id) {
      return NextResponse.json({ error: "Classroom not found" }, { status: 404 });
    }

    const body = await req.json();
    const { email, studentId } = body as {
      email?: string;
      studentId?: string;
    };

    if (!email && !studentId) {
      return NextResponse.json(
        { error: "Provide either email or studentId" },
        { status: 400 }
      );
    }

    // Find the student
    const student = await db.user.findFirst({
      where: studentId
        ? { id: studentId, role: "STUDENT" }
        : { email, role: "STUDENT" },
    });

    if (!student) {
      return NextResponse.json(
        { error: "Student not found" },
        { status: 404 }
      );
    }

    // Add membership
    const membership = await db.classroomMembership
      .create({
        data: {
          classroomId,
          studentId: student.id,
        },
      })
      .catch((e: unknown) => {
        if (
          e instanceof Error &&
          "code" in e &&
          (e as { code: string }).code === "P2002"
        ) {
          return null; // Already a member
        }
        throw e;
      });

    if (!membership) {
      return NextResponse.json(
        { message: "Student is already a member" },
        { status: 200 }
      );
    }

    // If classroom has a course, auto-enroll the student
    if (classroom.courseId) {
      await db.enrollment
        .create({
          data: {
            studentId: student.id,
            courseId: classroom.courseId,
          },
        })
        .catch(() => {}); // Ignore if already enrolled
    }

    return NextResponse.json(
      {
        membership: {
          id: membership.id,
          studentId: student.id,
          studentName: student.name,
          joinedAt: membership.joinedAt,
        },
      },
      { status: 201 }
    );
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw e;
  }
}

export async function DELETE(
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
    const { studentId } = body as { studentId: string };

    if (!studentId) {
      return NextResponse.json(
        { error: "studentId is required" },
        { status: 400 }
      );
    }

    await db.classroomMembership.deleteMany({
      where: { classroomId, studentId },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw e;
  }
}
