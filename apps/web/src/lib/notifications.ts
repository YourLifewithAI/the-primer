/**
 * Notification Engine for The Primer.
 *
 * Handles creation, querying, and management of in-app notifications.
 * Notification triggers are called from existing flows (BKT mastery,
 * guide analytics, FSRS due cards, assignment creation).
 */

import { db } from "@/lib/db";
import { NotificationType, Prisma } from "@prisma/client";

// ─── Types ──────────────────────────────────────────────────

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
  metadata?: Prisma.InputJsonValue;
}

export interface NotificationListResult {
  notifications: {
    id: string;
    type: NotificationType;
    title: string;
    body: string;
    link: string | null;
    read: boolean;
    metadata: unknown;
    createdAt: Date;
  }[];
  total: number;
  hasMore: boolean;
}

// ─── Core Operations ────────────────────────────────────────

/**
 * Create a single notification.
 */
export async function createNotification(
  input: CreateNotificationInput
) {
  return db.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      link: input.link ?? null,
      metadata: input.metadata ?? undefined,
    },
  });
}

/**
 * Create notifications for multiple users (batch).
 * Used when notifying all students in a classroom.
 */
export async function createNotificationBatch(
  inputs: CreateNotificationInput[]
) {
  if (inputs.length === 0) return;

  await db.notification.createMany({
    data: inputs.map((input) => ({
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      link: input.link ?? null,
      metadata: input.metadata ?? undefined,
    })),
  });
}

/**
 * Get paginated notifications for a user.
 */
export async function getNotifications(
  userId: string,
  options: { cursor?: string; limit?: number; unreadOnly?: boolean } = {}
): Promise<NotificationListResult> {
  const limit = Math.min(options.limit ?? 20, 50);

  const where = {
    userId,
    ...(options.unreadOnly ? { read: false } : {}),
  };

  const [notifications, total] = await Promise.all([
    db.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit + 1, // Fetch one extra to determine hasMore
      ...(options.cursor
        ? {
            cursor: { id: options.cursor },
            skip: 1, // Skip the cursor item
          }
        : {}),
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        link: true,
        read: true,
        metadata: true,
        createdAt: true,
      },
    }),
    db.notification.count({ where }),
  ]);

  const hasMore = notifications.length > limit;
  if (hasMore) notifications.pop(); // Remove the extra item

  return { notifications, total, hasMore };
}

/**
 * Get unread notification count for a user (lightweight for badge).
 */
export async function getUnreadCount(userId: string): Promise<number> {
  return db.notification.count({
    where: { userId, read: false },
  });
}

/**
 * Mark a single notification as read.
 */
export async function markAsRead(notificationId: string, userId: string) {
  return db.notification.updateMany({
    where: { id: notificationId, userId },
    data: { read: true },
  });
}

/**
 * Mark all notifications as read for a user.
 */
export async function markAllAsRead(userId: string) {
  return db.notification.updateMany({
    where: { userId, read: false },
    data: { read: true },
  });
}

// ─── Notification Triggers ──────────────────────────────────

/**
 * Notify parent and guide when a student masters a KC.
 * Called from the response handler on mastery transition.
 */
export async function notifyMastery(
  studentId: string,
  studentName: string | null,
  kcId: string,
  kcName: string
) {
  const name = studentName ?? "A student";
  const notifications: CreateNotificationInput[] = [];

  // Find parent via StudentProfile.parentId
  const studentProfile = await db.studentProfile.findUnique({
    where: { userId: studentId },
  });

  if (studentProfile?.parentId) {
    // Check parent notification preferences
    const parentProfile = await db.parentProfile.findUnique({
      where: { userId: studentProfile.parentId },
      include: { notificationPreferences: true },
    });

    if (parentProfile?.notificationPreferences?.milestoneAlerts !== false) {
      notifications.push({
        userId: studentProfile.parentId,
        type: "MILESTONE",
        title: "Mastery achieved!",
        body: `${name} mastered "${kcName}"`,
        link: `/parent`,
        metadata: { studentId, kcId },
      });
    }
  }

  // Find guides via classroom memberships
  const memberships = await db.classroomMembership.findMany({
    where: { studentId },
    include: {
      classroom: {
        include: {
          guide: { select: { userId: true } },
        },
      },
    },
  });

  const guideUserIds = new Set<string>();
  for (const m of memberships) {
    guideUserIds.add(m.classroom.guide.userId);
  }

  for (const guideUserId of guideUserIds) {
    notifications.push({
      userId: guideUserId,
      type: "MILESTONE",
      title: "Student mastery",
      body: `${name} mastered "${kcName}"`,
      link: `/guide`,
      metadata: { studentId, kcId },
    });
  }

  if (notifications.length > 0) {
    await createNotificationBatch(notifications).catch(() => {
      // Silent fail — don't break the learning flow
    });
  }
}

/**
 * Notify guide when a student is struggling.
 * A student is "struggling" when they have 2+ KCs with low mastery
 * despite high attempt count (same logic as guide-analytics).
 */
export async function notifyStruggling(
  studentId: string,
  studentName: string | null,
  strugglingKCNames: string[]
) {
  const name = studentName ?? "A student";
  const notifications: CreateNotificationInput[] = [];

  // Find guides via classroom memberships
  const memberships = await db.classroomMembership.findMany({
    where: { studentId },
    include: {
      classroom: {
        include: {
          guide: { select: { userId: true } },
        },
      },
    },
  });

  const guideUserIds = new Set<string>();
  for (const m of memberships) {
    guideUserIds.add(m.classroom.guide.userId);
  }

  const kcList = strugglingKCNames.slice(0, 3).join(", ");
  for (const guideUserId of guideUserIds) {
    notifications.push({
      userId: guideUserId,
      type: "STRUGGLE_ALERT",
      title: "Student needs help",
      body: `${name} is struggling with: ${kcList}`,
      link: `/guide`,
      metadata: { studentId, kcNames: strugglingKCNames },
    });
  }

  // Also notify parent if they have struggle alerts enabled
  const studentProfile = await db.studentProfile.findUnique({
    where: { userId: studentId },
  });

  if (studentProfile?.parentId) {
    const parentProfile = await db.parentProfile.findUnique({
      where: { userId: studentProfile.parentId },
      include: { notificationPreferences: true },
    });

    if (parentProfile?.notificationPreferences?.struggleAlerts !== false) {
      notifications.push({
        userId: studentProfile.parentId,
        type: "STRUGGLE_ALERT",
        title: "Your child needs help",
        body: `${name} is struggling with: ${kcList}`,
        link: `/parent`,
        metadata: { studentId, kcNames: strugglingKCNames },
      });
    }
  }

  if (notifications.length > 0) {
    await createNotificationBatch(notifications).catch(() => {});
  }
}

/**
 * Notify all students in a classroom when an assignment is created.
 */
export async function notifyAssignmentCreated(
  classroomId: string,
  classroomName: string,
  assignmentTitle: string,
  assignmentDueDate: Date | null
) {
  const members = await db.classroomMembership.findMany({
    where: { classroomId },
    select: { studentId: true },
  });

  const dueStr = assignmentDueDate
    ? ` (due ${assignmentDueDate.toLocaleDateString()})`
    : "";

  const notifications: CreateNotificationInput[] = members.map((m) => ({
    userId: m.studentId,
    type: "ASSIGNMENT_DUE" as NotificationType,
    title: "New assignment",
    body: `"${assignmentTitle}" in ${classroomName}${dueStr}`,
    link: `/learn`,
    metadata: { classroomId },
  }));

  if (notifications.length > 0) {
    await createNotificationBatch(notifications).catch(() => {});
  }
}

/**
 * Notify a student that they have FSRS cards due for review.
 */
export async function notifyReviewsDue(
  studentId: string,
  dueCount: number
) {
  if (dueCount <= 0) return;

  await createNotification({
    userId: studentId,
    type: "REVIEW_REMINDER",
    title: "Reviews due",
    body: `You have ${dueCount} card${dueCount === 1 ? "" : "s"} ready for review`,
    link: `/review`,
    metadata: { dueCount },
  }).catch(() => {});
}
