import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { ensureParent } from "@/lib/ensure-parent";
import { getChildrenOverview } from "@/lib/parent-analytics";

/**
 * GET /api/parent/children
 * List all linked children with overview stats.
 */
export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { user, parentProfile } = await ensureParent(clerkId);

    const children = await getChildrenOverview(parentProfile.childIds);

    // FERPA audit log for each child accessed
    for (const child of children) {
      await db.dataAccessLog.create({
        data: {
          userId: user.id,
          studentId: child.childId,
          action: "view_overview",
          details: { context: "parent_children_list" },
        },
      });
    }

    return NextResponse.json({ children });
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json(
        { error: "Forbidden: Parent role required" },
        { status: 403 }
      );
    }
    throw e;
  }
}
