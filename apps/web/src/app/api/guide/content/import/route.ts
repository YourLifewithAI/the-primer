import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { ensureGuide } from "@/lib/ensure-guide";
import {
  type CourseDefinition,
  validateCourse,
} from "@primer/shared/src/content-schema";

/**
 * POST /api/guide/content/import
 * Bulk import content from JSON (OATutor/Primer format).
 * Body: CourseDefinition JSON
 *
 * Validates the content first and returns errors if any.
 * On success, imports the course with the guide as author.
 */
export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { guideProfile } = await ensureGuide(clerkId);

    let course: CourseDefinition;
    try {
      course = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON" },
        { status: 400 }
      );
    }

    // Validate the course structure
    const errors = validateCourse(course);
    if (errors.length > 0) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: errors,
          summary: `${errors.length} validation error${errors.length === 1 ? "" : "s"} found`,
        },
        { status: 422 }
      );
    }

    // Check for ID conflicts with existing content
    const existingCourse = await db.course.findUnique({
      where: { id: course.id },
    });

    // Generate a new ID if the course ID already exists
    const courseId = existingCourse
      ? `${course.id}-${Date.now()}`
      : course.id;

    // Import everything in a transaction
    const result = await db.$transaction(async (tx) => {
      // Create the course
      const dbCourse = await tx.course.create({
        data: {
          id: courseId,
          title: course.title,
          description: course.description,
          subject: course.subject,
          gradeLevel: course.gradeLevels,
          published: false, // Start as unpublished
          isShared: false,
          authorId: guideProfile.id,
        },
      });

      // Create KCs
      let kcCount = 0;
      for (const kc of course.knowledgeComponents) {
        // Check if KC already exists
        const existingKC = await tx.knowledgeComponent.findUnique({
          where: { id: kc.id },
        });
        if (!existingKC) {
          await tx.knowledgeComponent.create({
            data: {
              id: kc.id,
              name: kc.name,
              description: kc.description,
              subject: kc.subject,
              gradeLevel: kc.gradeLevels,
            },
          });
          kcCount++;
        }
      }

      // Create KC prerequisites (only for newly created KCs)
      for (const kc of course.knowledgeComponents) {
        for (const prereqId of kc.prerequisites) {
          const existing = await tx.kCPrerequisite.findUnique({
            where: {
              prerequisiteId_dependentId: {
                prerequisiteId: prereqId,
                dependentId: kc.id,
              },
            },
          });
          if (!existing) {
            await tx.kCPrerequisite.create({
              data: {
                prerequisiteId: prereqId,
                dependentId: kc.id,
              },
            });
          }
        }
      }

      // Create modules, lessons, problems
      let lessonCount = 0;
      let problemCount = 0;

      for (let mi = 0; mi < course.modules.length; mi++) {
        const mod = course.modules[mi];

        const dbModule = await tx.module.create({
          data: {
            title: mod.title,
            orderIndex: mi,
            courseId: dbCourse.id,
          },
        });

        for (let li = 0; li < mod.lessons.length; li++) {
          const lesson = mod.lessons[li];

          const dbLesson = await tx.lesson.create({
            data: {
              title: lesson.title,
              content: lesson.content ?? null,
              orderIndex: li,
              moduleId: dbModule.id,
              status: "DRAFT",
              authorId: guideProfile.id,
            },
          });
          lessonCount++;

          for (let pi = 0; pi < lesson.problems.length; pi++) {
            const problem = lesson.problems[pi];

            const dbProblem = await tx.problem.create({
              data: {
                title: problem.title,
                difficulty: problem.difficulty,
                content: problem as unknown as object,
                orderIndex: pi,
                lessonId: dbLesson.id,
              },
            });
            problemCount++;

            // Link problem to KCs
            const kcIds = new Set<string>();
            for (const step of problem.steps) {
              for (const kcId of step.kcs) {
                kcIds.add(kcId);
              }
            }
            for (const kcId of kcIds) {
              await tx.problemKC.create({
                data: {
                  problemId: dbProblem.id,
                  kcId,
                },
              });
            }
          }
        }
      }

      return {
        courseId: dbCourse.id,
        courseTitle: dbCourse.title,
        stats: {
          kcsCreated: kcCount,
          kcsReused: course.knowledgeComponents.length - kcCount,
          modules: course.modules.length,
          lessons: lessonCount,
          problems: problemCount,
        },
      };
    });

    return NextResponse.json(
      {
        success: true,
        ...result,
      },
      { status: 201 }
    );
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("Import error:", e);
    return NextResponse.json(
      { error: "Import failed", details: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
