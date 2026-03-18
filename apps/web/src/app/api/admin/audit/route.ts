import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ensureAdmin } from "@/lib/ensure-admin";
import { getAuditLogs } from "@/lib/admin-analytics";

/**
 * GET /api/admin/audit?userId=&action=&startDate=&endDate=&page=&pageSize=
 * Searchable audit log viewer for FERPA compliance verification.
 */
export async function GET(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensureAdmin(clerkId);

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId") ?? undefined;
    const action = searchParams.get("action") ?? undefined;
    const startDateStr = searchParams.get("startDate");
    const endDateStr = searchParams.get("endDate");
    const page = parseInt(searchParams.get("page") ?? "1", 10);
    const pageSize = Math.min(parseInt(searchParams.get("pageSize") ?? "50", 10), 10000);

    const startDate = startDateStr ? new Date(startDateStr) : undefined;
    const endDate = endDateStr ? new Date(endDateStr) : undefined;

    const result = await getAuditLogs({ userId, action, startDate, endDate, page, pageSize });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden: Admin role required" }, { status: 403 });
    }
    throw e;
  }
}
