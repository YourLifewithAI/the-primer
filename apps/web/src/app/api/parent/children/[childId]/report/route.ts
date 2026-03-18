import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { ensureParent, verifyChildAccess } from "@/lib/ensure-parent";
import { getWeeklyReport } from "@/lib/parent-analytics";

/**
 * GET /api/parent/children/[childId]/report
 * Get weekly progress report data for a child.
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

    const report = await getWeeklyReport(childId);

    // FERPA audit log
    await db.dataAccessLog.create({
      data: {
        userId: user.id,
        studentId: childId,
        action: "view_report",
        details: { context: "parent_weekly_report" },
      },
    });

    return NextResponse.json(report);
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
