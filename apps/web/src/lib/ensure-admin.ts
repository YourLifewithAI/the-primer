import { ensureUser } from "@/lib/ensure-user";

/**
 * Ensures the current Clerk user is an ADMIN.
 * Returns the user.
 * Throws if the user is not authorized as an admin.
 */
export async function ensureAdmin(clerkId: string) {
  const user = await ensureUser(clerkId);

  if (user.role !== "ADMIN") {
    throw new Error("FORBIDDEN");
  }

  return { user };
}
