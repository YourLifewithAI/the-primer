import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { ensureParent, verifyChildAccess } from "@/lib/ensure-parent";
import { getChildDetail } from "@/lib/parent-analytics";

/**
 * GET /api/parent/children/[childId]
 * Get detailed progress data for a specific child.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ childId: string }> }
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { user, parentProfile } = await ensureParent(clerkId);
    const { childId } = await params;

    await verifyChildAccess(parentProfile, childId);

    const detail = await getChildDetail(childId);

    // FERPA audit log
    await db.dataAccessLog.create({
      data: {
        userId: user.id,
        studentId: childId,
        action: "view_mastery",
        details: { context: "parent_child_detail" },
      },
    });

    return NextResponse.json(detail);
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (
      e instanceof Error &&
      (e.message === "CHILD_NOT_LINKED" || e.message === "CHILD_NOT_FOUND")
    ) {
      return NextResponse.json(
        { error: "Child not found or not linked to your account" },
        { status: 404 }
      );
    }
    throw e;
  }
}
