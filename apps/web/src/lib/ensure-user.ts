import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";
import { clerkClient } from "@clerk/nextjs/server";

/**
 * Maps Clerk publicMetadata.role to our Prisma UserRole enum.
 * Defaults to STUDENT if not set or unrecognized.
 */
function resolveRole(clerkMetadata: Record<string, unknown>): UserRole {
  const raw = clerkMetadata?.role;
  if (typeof raw === "string") {
    const upper = raw.toUpperCase();
    if (upper === "GUIDE" || upper === "ADMIN" || upper === "PARENT") {
      return upper as UserRole;
    }
  }
  return "STUDENT";
}

/**
 * Ensures a User row exists in Prisma for the given Clerk user.
 * On first request, pulls email/name/role from Clerk and creates the row.
 * Auto-enrolls students in the first published course.
 */
export async function ensureUser(clerkId: string) {
  // Fast path: user already exists
  let user = await db.user.findUnique({ where: { clerkId } });
  if (user) return user;

  // Slow path: create from Clerk data
  const client = await clerkClient();
  const clerkUser = await client.users.getUser(clerkId);
  const email =
    clerkUser.emailAddresses[0]?.emailAddress ?? `${clerkId}@primer.local`;
  const name =
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || null;
  const role = resolveRole(
    clerkUser.publicMetadata as Record<string, unknown>
  );

  try {
    user = await db.user.create({
      data: { clerkId, email, name, role },
    });

    // Auto-enroll students in the first published course
    if (role === "STUDENT") {
      const defaultCourse = await db.course.findFirst({
        where: { published: true },
      });
      if (defaultCourse) {
        await db.enrollment
          .create({
            data: { studentId: user.id, courseId: defaultCourse.id },
          })
          .catch(() => {}); // Ignore if already enrolled
      }
    }
  } catch (e: unknown) {
    // Race condition: another request created the user simultaneously
    if (
      e instanceof Error &&
      "code" in e &&
      (e as { code: string }).code === "P2002"
    ) {
      user = await db.user.findUnique({ where: { clerkId } });
      if (!user) throw e;
    } else {
      throw e;
    }
  }

  return user;
}
