import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ensureAdmin } from "@/lib/ensure-admin";
import { getPlatformStats } from "@/lib/admin-analytics";

/**
 * GET /api/admin/stats
 * Platform-wide statistics for the admin dashboard.
 */
export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensureAdmin(clerkId);
    const stats = await getPlatformStats();
    return NextResponse.json(stats);
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden: Admin role required" }, { status: 403 });
    }
    throw e;
  }
}
