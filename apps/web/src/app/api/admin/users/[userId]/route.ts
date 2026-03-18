import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { ensureAdmin } from "@/lib/ensure-admin";
import { getUserDetail } from "@/lib/admin-analytics";
import { UserRole } from "@prisma/client";

/**
 * GET /api/admin/users/[userId]
 * Get detailed user information.
 * Logs data access for FERPA compliance.
 *
 * PATCH /api/admin/users/[userId]
 * Update user role or deactivate account.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { user: adminUser } = await ensureAdmin(clerkId);
    const { userId } = await params;
    const detail = await getUserDetail(userId);

    // FERPA: log access to student data
    await db.dataAccessLog.create({
      data: {
        userId: adminUser.id,
        studentId: userId,
        action: "view_overview",
        details: { source: "admin_user_detail" },
        ipAddress: req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip"),
      },
    });

    return NextResponse.json(detail);
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden: Admin role required" }, { status: 403 });
    }
    throw e;
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { user: adminUser } = await ensureAdmin(clerkId);
    const { userId } = await params;
    const body = await req.json();
    const { role } = body as { role?: string };

    // Validate role
    if (role !== undefined) {
      if (!Object.values(UserRole).includes(role as UserRole)) {
        return NextResponse.json({ error: "Invalid role" }, { status: 400 });
      }

      // Prevent admin from demoting themselves
      if (userId === adminUser.id && role !== "ADMIN") {
        return NextResponse.json(
          { error: "Cannot change your own admin role" },
          { status: 400 }
        );
      }

      const previousRole = (await db.user.findUniqueOrThrow({ where: { id: userId }, select: { role: true } })).role;

      await db.user.update({
        where: { id: userId },
        data: { role: role as UserRole },
      });

      // FERPA: log role change
      await db.dataAccessLog.create({
        data: {
          userId: adminUser.id,
          studentId: userId,
          action: "role_change",
          details: { previousRole, newRole: role, source: "admin_user_detail" },
          ipAddress: req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip"),
        },
      });

      // If promoting to GUIDE, ensure guide profile exists
      if (role === "GUIDE" || role === "ADMIN") {
        const existingProfile = await db.guideProfile.findUnique({
          where: { userId },
        });
        if (!existingProfile) {
          await db.guideProfile.create({ data: { userId } });
        }
      }

      // If promoting to PARENT, ensure parent profile exists
      if (role === "PARENT") {
        const existingProfile = await db.parentProfile.findUnique({
          where: { userId },
        });
        if (!existingProfile) {
          await db.parentProfile.create({ data: { userId, childIds: [] } });
        }
      }
    }

    const updated = await getUserDetail(userId);
    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden: Admin role required" }, { status: 403 });
    }
    throw e;
  }
}
