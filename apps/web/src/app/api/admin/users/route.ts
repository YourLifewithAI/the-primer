import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ensureAdmin } from "@/lib/ensure-admin";
import { getUsers } from "@/lib/admin-analytics";
import { UserRole } from "@prisma/client";

/**
 * GET /api/admin/users?search=&role=&page=&pageSize=
 * Searchable user list with role filtering and pagination.
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
    const roleParam = searchParams.get("role");
    const role = roleParam && Object.values(UserRole).includes(roleParam as UserRole)
      ? (roleParam as UserRole)
      : undefined;
    const page = parseInt(searchParams.get("page") ?? "1", 10);
    const pageSize = Math.min(parseInt(searchParams.get("pageSize") ?? "25", 10), 100);

    const result = await getUsers({ search, role, page, pageSize });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden: Admin role required" }, { status: 403 });
    }
    throw e;
  }
}
