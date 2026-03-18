import { db } from "@/lib/db";
import { ensureUser } from "@/lib/ensure-user";

/**
 * Ensures the current Clerk user is a GUIDE or ADMIN.
 * Returns the user and their GuideProfile.
 * Throws if the user is not authorized as a guide.
 */
export async function ensureGuide(clerkId: string) {
  const user = await ensureUser(clerkId);

  if (user.role !== "GUIDE" && user.role !== "ADMIN") {
    throw new Error("FORBIDDEN");
  }

  // Ensure guide profile exists
  let guideProfile = await db.guideProfile.findUnique({
    where: { userId: user.id },
  });

  if (!guideProfile) {
    guideProfile = await db.guideProfile.create({
      data: { userId: user.id },
    });
  }

  return { user, guideProfile };
}
