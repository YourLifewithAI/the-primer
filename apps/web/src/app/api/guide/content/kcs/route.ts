import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { ensureGuide } from "@/lib/ensure-guide";

/**
 * GET /api/guide/content/kcs
 * List/search Knowledge Components.
 * Query params: ?subject=MATH&gradeLevel=5&search=distributive
 */
export async function GET(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensureGuide(clerkId);

    const { searchParams } = new URL(req.url);
    const subject = searchParams.get("subject");
    const gradeLevel = searchParams.get("gradeLevel");
    const search = searchParams.get("search");

    const kcs = await db.knowledgeComponent.findMany({
      where: {
        ...(subject && { subject: subject as "MATH" | "SCIENCE" | "ELA" | "SOCIAL_STUDIES" }),
        ...(gradeLevel && { gradeLevel: { has: parseInt(gradeLevel, 10) } }),
        ...(search && {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { description: { contains: search, mode: "insensitive" as const } },
          ],
        }),
      },
      include: {
        prerequisites: {
          include: { prerequisite: { select: { id: true, name: true } } },
        },
        _count: { select: { problemKCs: true } },
      },
      orderBy: { name: "asc" },
      take: 100,
    });

    return NextResponse.json({ kcs });
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw e;
  }
}

/**
 * POST /api/guide/content/kcs
 * Create a new Knowledge Component.
 */
export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensureGuide(clerkId);
    const body = await req.json();
    const { name, description, subject, gradeLevels, prerequisiteIds } = body as {
      name: string;
      description?: string;
      subject: string;
      gradeLevels: number[];
      prerequisiteIds?: string[];
    };

    if (!name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    if (!subject || !["MATH", "SCIENCE", "ELA", "SOCIAL_STUDIES"].includes(subject)) {
      return NextResponse.json({ error: "Valid subject is required" }, { status: 400 });
    }
    if (!gradeLevels?.length) {
      return NextResponse.json({ error: "At least one grade level is required" }, { status: 400 });
    }

    const kc = await db.knowledgeComponent.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        subject: subject as "MATH" | "SCIENCE" | "ELA" | "SOCIAL_STUDIES",
        gradeLevel: gradeLevels,
      },
    });

    // Add prerequisites
    if (prerequisiteIds?.length) {
      await db.kCPrerequisite.createMany({
        data: prerequisiteIds.map((prereqId) => ({
          prerequisiteId: prereqId,
          dependentId: kc.id,
        })),
        skipDuplicates: true,
      });
    }

    const created = await db.knowledgeComponent.findUnique({
      where: { id: kc.id },
      include: {
        prerequisites: {
          include: { prerequisite: { select: { id: true, name: true } } },
        },
      },
    });

    return NextResponse.json({ kc: created }, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw e;
  }
}
