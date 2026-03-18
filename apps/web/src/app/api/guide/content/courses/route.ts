import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { ensureGuide } from "@/lib/ensure-guide";

/**
 * GET /api/guide/content/courses
 * List courses authored by this guide + shared courses.
 */
export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { guideProfile } = await ensureGuide(clerkId);

    const courses = await db.course.findMany({
      where: {
        OR: [
          { authorId: guideProfile.id },
          { isShared: true },
          { authorId: null }, // Seed content (no author)
        ],
      },
      include: {
        _count: { select: { modules: true, enrollments: true } },
        author: { include: { user: { select: { name: true } } } },
      },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({ courses });
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw e;
  }
}

/**
 * POST /api/guide/content/courses
 * Create a new course.
 */
export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { guideProfile } = await ensureGuide(clerkId);
    const body = await req.json();
    const { title, description, subject, gradeLevels, isShared } = body as {
      title: string;
      description?: string;
      subject: string;
      gradeLevels: number[];
      isShared?: boolean;
    };

    if (!title?.trim()) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }
    if (!subject || !["MATH", "SCIENCE", "ELA", "SOCIAL_STUDIES"].includes(subject)) {
      return NextResponse.json({ error: "Valid subject is required" }, { status: 400 });
    }
    if (!gradeLevels?.length) {
      return NextResponse.json({ error: "At least one grade level is required" }, { status: 400 });
    }

    const course = await db.course.create({
      data: {
        title: title.trim(),
        description: description?.trim() || null,
        subject: subject as "MATH" | "SCIENCE" | "ELA" | "SOCIAL_STUDIES",
        gradeLevel: gradeLevels,
        isShared: isShared ?? false,
        authorId: guideProfile.id,
        published: false,
      },
    });

    return NextResponse.json({ course }, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw e;
  }
}
