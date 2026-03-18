import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ensureAdmin } from "@/lib/ensure-admin";
import { getPlatformAnalytics } from "@/lib/admin-analytics";

/**
 * GET /api/admin/analytics
 * Deep platform analytics: mastery trends, engagement, tutor usage, content stats.
 */
export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensureAdmin(clerkId);
    const analytics = await getPlatformAnalytics();
    return NextResponse.json(analytics);
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden: Admin role required" }, { status: 403 });
    }
    throw e;
  }
}
