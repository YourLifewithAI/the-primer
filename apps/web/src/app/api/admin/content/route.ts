import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ensureAdmin } from "@/lib/ensure-admin";
import { getContentList } from "@/lib/admin-analytics";

/**
 * GET /api/admin/content?search=&type=&page=&pageSize=
 * List all content with author info and usage stats.
 */
export async function GET(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensureAdmin(clerkId);

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") ?? undefined;
    const typeParam = searchParams.get("type");
    const type = typeParam === "course" || typeParam === "lesson" ? typeParam : undefined;
    const page = parseInt(searchParams.get("page") ?? "1", 10);
    const pageSize = Math.min(parseInt(searchParams.get("pageSize") ?? "25", 10), 100);

    const result = await getContentList({ search, type, page, pageSize });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden: Admin role required" }, { status: 403 });
    }
    throw e;
  }
}
