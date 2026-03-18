import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { ensureGuide } from "@/lib/ensure-guide";
import { getStudentDetail } from "@/lib/guide-analytics";

/**
 * GET /api/guide/students/[studentId]
 * Get detailed student progress. Guide must have this student in one of their classrooms.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ studentId: string }> }
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { guideProfile } = await ensureGuide(clerkId);
    const { studentId } = await params;

    // Verify guide has access to this student (student is in one of their classrooms)
    const membership = await db.classroomMembership.findFirst({
      where: {
        studentId,
        classroom: { guideId: guideProfile.id },
      },
    });

    if (!membership) {
      return NextResponse.json(
        { error: "Student not found in your classrooms" },
        { status: 404 }
      );
    }

    const detail = await getStudentDetail(studentId);

    // FERPA audit log
    await db.dataAccessLog.create({
      data: {
        userId: guideProfile.userId,
        studentId,
        action: "view_mastery",
        details: { context: "guide_student_detail" },
      },
    });

    return NextResponse.json(detail);
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw e;
  }
}
