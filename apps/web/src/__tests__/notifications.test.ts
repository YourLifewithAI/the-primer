/**
 * Tests for the notification engine.
 *
 * Uses mocked Prisma client from setup.ts.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { prismaMock } from "./setup";
import {
  createNotification,
  createNotificationBatch,
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  notifyReviewsDue,
} from "../lib/notifications";

describe("Notification Engine", () => {
  // ─── createNotification ─────────────────────────────────────

  describe("createNotification", () => {
    it("creates a notification with all fields", async () => {
      const mockNotification = {
        id: "notif-1",
        userId: "user-1",
        type: "MILESTONE" as const,
        title: "Mastery achieved!",
        body: "You mastered Addition",
        link: "/learn",
        read: false,
        metadata: { kcId: "kc-1" },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prismaMock.notification.create.mockResolvedValue(mockNotification);

      const result = await createNotification({
        userId: "user-1",
        type: "MILESTONE",
        title: "Mastery achieved!",
        body: "You mastered Addition",
        link: "/learn",
        metadata: { kcId: "kc-1" },
      });

      expect(result.id).toBe("notif-1");
      expect(prismaMock.notification.create).toHaveBeenCalledOnce();
    });

    it("sets link to null when not provided", async () => {
      prismaMock.notification.create.mockResolvedValue({} as any);

      await createNotification({
        userId: "user-1",
        type: "MILESTONE",
        title: "Test",
        body: "Test body",
      });

      expect(prismaMock.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ link: null }),
      });
    });
  });

  // ─── createNotificationBatch ────────────────────────────────

  describe("createNotificationBatch", () => {
    it("creates multiple notifications", async () => {
      prismaMock.notification.createMany.mockResolvedValue({ count: 2 });

      await createNotificationBatch([
        {
          userId: "user-1",
          type: "MILESTONE",
          title: "Test 1",
          body: "Body 1",
        },
        {
          userId: "user-2",
          type: "MILESTONE",
          title: "Test 2",
          body: "Body 2",
        },
      ]);

      expect(prismaMock.notification.createMany).toHaveBeenCalledOnce();
    });

    it("skips when input array is empty", async () => {
      await createNotificationBatch([]);
      expect(prismaMock.notification.createMany).not.toHaveBeenCalled();
    });
  });

  // ─── getNotifications ───────────────────────────────────────

  describe("getNotifications", () => {
    it("returns paginated notifications", async () => {
      const mockNotifications = [
        {
          id: "n1",
          type: "MILESTONE" as const,
          title: "Test",
          body: "Body",
          link: null,
          read: false,
          metadata: null,
          createdAt: new Date(),
        },
      ];

      prismaMock.notification.findMany.mockResolvedValue(mockNotifications as any);
      prismaMock.notification.count.mockResolvedValue(1);

      const result = await getNotifications("user-1");

      expect(result.notifications).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.hasMore).toBe(false);
    });

    it("caps limit at 50", async () => {
      prismaMock.notification.findMany.mockResolvedValue([]);
      prismaMock.notification.count.mockResolvedValue(0);

      await getNotifications("user-1", { limit: 100 });

      // Should request 51 (50 + 1 for hasMore check)
      expect(prismaMock.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 51 })
      );
    });

    it("detects hasMore when extra items exist", async () => {
      // Return limit+1 items to trigger hasMore
      const manyNotifications = Array.from({ length: 21 }, (_, i) => ({
        id: `n${i}`,
        type: "MILESTONE" as const,
        title: "Test",
        body: "Body",
        link: null,
        read: false,
        metadata: null,
        createdAt: new Date(),
      }));

      prismaMock.notification.findMany.mockResolvedValue(manyNotifications as any);
      prismaMock.notification.count.mockResolvedValue(25);

      const result = await getNotifications("user-1", { limit: 20 });

      expect(result.hasMore).toBe(true);
      expect(result.notifications).toHaveLength(20);
    });

    it("filters unread only", async () => {
      prismaMock.notification.findMany.mockResolvedValue([]);
      prismaMock.notification.count.mockResolvedValue(0);

      await getNotifications("user-1", { unreadOnly: true });

      expect(prismaMock.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ read: false }),
        })
      );
    });
  });

  // ─── getUnreadCount ─────────────────────────────────────────

  describe("getUnreadCount", () => {
    it("returns count of unread notifications", async () => {
      prismaMock.notification.count.mockResolvedValue(5);

      const count = await getUnreadCount("user-1");
      expect(count).toBe(5);

      expect(prismaMock.notification.count).toHaveBeenCalledWith({
        where: { userId: "user-1", read: false },
      });
    });
  });

  // ─── markAsRead ─────────────────────────────────────────────

  describe("markAsRead", () => {
    it("updates notification with correct filters", async () => {
      prismaMock.notification.updateMany.mockResolvedValue({ count: 1 });

      await markAsRead("notif-1", "user-1");

      expect(prismaMock.notification.updateMany).toHaveBeenCalledWith({
        where: { id: "notif-1", userId: "user-1" },
        data: { read: true },
      });
    });
  });

  // ─── markAllAsRead ──────────────────────────────────────────

  describe("markAllAsRead", () => {
    it("updates all unread for user", async () => {
      prismaMock.notification.updateMany.mockResolvedValue({ count: 10 });

      await markAllAsRead("user-1");

      expect(prismaMock.notification.updateMany).toHaveBeenCalledWith({
        where: { userId: "user-1", read: false },
        data: { read: true },
      });
    });
  });

  // ─── notifyReviewsDue ───────────────────────────────────────

  describe("notifyReviewsDue", () => {
    it("creates notification for due reviews", async () => {
      prismaMock.notification.create.mockResolvedValue({} as any);

      await notifyReviewsDue("student-1", 5);

      expect(prismaMock.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: "student-1",
          type: "REVIEW_REMINDER",
          body: "You have 5 cards ready for review",
        }),
      });
    });

    it("uses singular 'card' for 1 review", async () => {
      prismaMock.notification.create.mockResolvedValue({} as any);

      await notifyReviewsDue("student-1", 1);

      expect(prismaMock.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          body: "You have 1 card ready for review",
        }),
      });
    });

    it("skips when dueCount is 0", async () => {
      await notifyReviewsDue("student-1", 0);
      expect(prismaMock.notification.create).not.toHaveBeenCalled();
    });

    it("skips when dueCount is negative", async () => {
      await notifyReviewsDue("student-1", -1);
      expect(prismaMock.notification.create).not.toHaveBeenCalled();
    });
  });
});
