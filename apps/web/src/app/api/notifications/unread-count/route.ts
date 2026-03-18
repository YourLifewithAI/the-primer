import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ensureUser } from "@/lib/ensure-user";
import { getUnreadCount } from "@/lib/notifications";

/**
 * GET /api/notifications/unread-count
 *
 * Lightweight endpoint returning only the unread notification count.
 * Used by the header bell icon badge.
 */
export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await ensureUser(clerkId);
  const count = await getUnreadCount(user.id);

  return NextResponse.json({ count });
}
