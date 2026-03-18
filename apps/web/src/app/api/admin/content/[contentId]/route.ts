import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { ensureAdmin } from "@/lib/ensure-admin";

/**
 * PATCH /api/admin/content/[contentId]
 * Update content status (publish, unpublish, archive, flag).
 * Body: { type: "course" | "lesson", action: "publish" | "unpublish" | "archive" | "flag" }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ contentId: string }> }
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { user: adminUser } = await ensureAdmin(clerkId);
    const { contentId } = await params;
    const body = await req.json();
    const { type, action } = body as {
      type: "course" | "lesson";
      action: "publish" | "unpublish" | "archive" | "flag";
    };

    if (!type || !action) {
      return NextResponse.json(
        { error: "type and action are required" },
        { status: 400 }
      );
    }

    if (type === "course") {
      const published = action === "publish";
      await db.course.update({
        where: { id: contentId },
        data: { published },
      });

      // Audit log: content moderation action
      await db.dataAccessLog.create({
        data: {
          userId: adminUser.id,
          studentId: adminUser.id, // no student involved; record the actor
          action: "content_moderate",
          details: { contentId, contentType: type, moderationAction: action, published },
          ipAddress: req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip"),
        },
      });

      return NextResponse.json({ id: contentId, type, published });
    }

    if (type === "lesson") {
      const statusMap: Record<string, "PUBLISHED" | "DRAFT" | "ARCHIVED"> = {
        publish: "PUBLISHED",
        unpublish: "DRAFT",
        archive: "ARCHIVED",
        flag: "ARCHIVED", // Flag = archive for review
      };
      const status = statusMap[action];
      if (!status) {
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
      }

      await db.lesson.update({
        where: { id: contentId },
        data: { status },
      });

      // Audit log: content moderation action
      await db.dataAccessLog.create({
        data: {
          userId: adminUser.id,
          studentId: adminUser.id, // no student involved; record the actor
          action: "content_moderate",
          details: { contentId, contentType: type, moderationAction: action, newStatus: status },
          ipAddress: req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip"),
        },
      });

      return NextResponse.json({ id: contentId, type, status });
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden: Admin role required" }, { status: 403 });
    }
    throw e;
  }
}
