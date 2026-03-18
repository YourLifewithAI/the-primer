import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ensureUser } from "@/lib/ensure-user";
import { getNotifications } from "@/lib/notifications";

/**
 * GET /api/notifications
 *
 * List notifications for the authenticated user with cursor-based pagination.
 * Query params: cursor, limit (max 50), unreadOnly (boolean)
 */
export async function GET(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await ensureUser(clerkId);

  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const limit = parseInt(url.searchParams.get("limit") ?? "20", 10);
  const unreadOnly = url.searchParams.get("unreadOnly") === "true";

  const result = await getNotifications(user.id, {
    cursor,
    limit: isNaN(limit) ? 20 : limit,
    unreadOnly,
  });

  return NextResponse.json(result);
}
