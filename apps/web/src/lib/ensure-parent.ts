import { db } from "@/lib/db";
import { ensureUser } from "@/lib/ensure-user";

/**
 * Ensures the current Clerk user is a PARENT or ADMIN.
 * Returns the user and their ParentProfile.
 * Throws if the user is not authorized as a parent.
 */
export async function ensureParent(clerkId: string) {
  const user = await ensureUser(clerkId);

  if (user.role !== "PARENT" && user.role !== "ADMIN") {
    throw new Error("FORBIDDEN");
  }

  // Ensure parent profile exists
  let parentProfile = await db.parentProfile.findUnique({
    where: { userId: user.id },
  });

  if (!parentProfile) {
    parentProfile = await db.parentProfile.create({
      data: { userId: user.id, childIds: [] },
    });
  }

  return { user, parentProfile };
}

/**
 * Verifies that the parent has access to the given child.
 * Returns the child user or throws if not linked.
 */
export async function verifyChildAccess(
  parentProfile: { childIds: string[] },
  childId: string
) {
  if (!parentProfile.childIds.includes(childId)) {
    throw new Error("CHILD_NOT_LINKED");
  }

  const child = await db.user.findUnique({
    where: { id: childId },
    include: {
      studentProfile: true,
    },
  });

  if (!child || child.role !== "STUDENT") {
    throw new Error("CHILD_NOT_FOUND");
  }

  return child;
}
