import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ensureUser } from "@/lib/ensure-user";
import { markAllAsRead } from "@/lib/notifications";

/**
 * POST /api/notifications/mark-all-read
 *
 * Mark all notifications as read for the authenticated user.
 */
export async function POST() {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await ensureUser(clerkId);
  const result = await markAllAsRead(user.id);

  return NextResponse.json({ marked: result.count });
}
