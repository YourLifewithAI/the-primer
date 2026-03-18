/**
 * Tests for parent analytics — weekly report generation.
 *
 * Uses mocked Prisma client.
 */

import { describe, it, expect } from "vitest";
import { prismaMock } from "./setup";
import { getWeeklyReport, getChildrenOverview } from "../lib/parent-analytics";
import { MASTERY_THRESHOLD } from "@primer/shared";

describe("Parent Analytics", () => {
  // ─── getChildrenOverview ────────────────────────────────────

  describe("getChildrenOverview", () => {
    it("returns empty array for empty childIds", async () => {
      const result = await getChildrenOverview([]);
      expect(result).toEqual([]);
    });

    it("returns overview for children", async () => {
      prismaMock.user.findMany.mockResolvedValue([
        {
          id: "child-1",
          name: "Timmy",
          studentProfile: { gradeLevel: 5 },
          masteryStates: [
            { pMastery: 0.96 },
            { pMastery: 0.5 },
          ],
        },
      ] as any);
      prismaMock.problemResponse.count.mockResolvedValue(15);
      prismaMock.problemResponse.findFirst.mockResolvedValue({
        createdAt: new Date(),
      } as any);
      // Mock streak calculation
      prismaMock.problemResponse.findMany.mockResolvedValue([]);

      const result = await getChildrenOverview(["child-1"]);

      expect(result).toHaveLength(1);
      expect(result[0].childId).toBe("child-1");
      expect(result[0].childName).toBe("Timmy");
      expect(result[0].totalKCs).toBe(2);
      expect(result[0].masteredKCs).toBe(1); // Only 0.96 >= 0.95
      expect(result[0].problemsThisWeek).toBe(15);
    });
  });

  // ─── getWeeklyReport ────────────────────────────────────────

  describe("getWeeklyReport", () => {
    const mockUser = {
      id: "child-1",
      name: "Timmy",
      email: "timmy@example.com",
      role: "STUDENT",
      studentProfile: { gradeLevel: 5 },
      masteryStates: [
        {
          kcId: "kc-1",
          pMastery: 0.97,
          totalAttempts: 15,
          correctCount: 14,
          masteredAt: new Date(), // This week
          kc: { name: "Addition" },
          lastAttemptAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          kcId: "kc-2",
          pMastery: 0.4,
          totalAttempts: 8,
          correctCount: 3,
          masteredAt: null,
          kc: { name: "Division" },
          lastAttemptAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    };

    it("generates a weekly report", async () => {
      prismaMock.user.findUniqueOrThrow.mockResolvedValue(mockUser as any);
      (prismaMock.problemResponse.findMany as any).mockImplementation((args: any) => {
        // For weekly responses query
        if (args?.where?.createdAt) {
          return Promise.resolve([
            { correct: true, kcId: "kc-1" },
            { correct: true, kcId: "kc-1" },
            { correct: false, kcId: "kc-2" },
          ] as any);
        }
        // For streak calculation
        return Promise.resolve([]);
      });
      prismaMock.engagementAggregate.findMany.mockResolvedValue([
        { date: new Date(), activeMinutes: 30, studentId: "child-1" },
      ] as any);

      const report = await getWeeklyReport("child-1");

      expect(report.childName).toBe("Timmy");
      expect(report.gradeLevel).toBe(5);
      expect(report.problemsSolved).toBe(3);
      expect(report.problemsCorrect).toBe(2);
      expect(report.accuracy).toBeCloseTo(2 / 3);
      expect(report.weekStarting).toBeTruthy();
      expect(report.weekEnding).toBeTruthy();
    });

    it("identifies newly mastered KCs this week", async () => {
      prismaMock.user.findUniqueOrThrow.mockResolvedValue(mockUser as any);
      prismaMock.problemResponse.findMany.mockResolvedValue([]);
      prismaMock.engagementAggregate.findMany.mockResolvedValue([]);

      const report = await getWeeklyReport("child-1");

      // Addition was mastered (masteredAt is this week, pMastery >= threshold)
      expect(report.newlyMastered).toContain("Addition");
    });

    it("identifies strengths and areas for practice", async () => {
      prismaMock.user.findUniqueOrThrow.mockResolvedValue(mockUser as any);
      prismaMock.problemResponse.findMany.mockResolvedValue([]);
      prismaMock.engagementAggregate.findMany.mockResolvedValue([]);

      const report = await getWeeklyReport("child-1");

      // Addition is mastered = strength
      expect(report.strengths).toContain("Addition");
      // Division has low mastery with attempts = area for practice
      expect(report.areasForPractice).toContain("Division");
    });

    it("includes encouraging message", async () => {
      prismaMock.user.findUniqueOrThrow.mockResolvedValue(mockUser as any);
      prismaMock.problemResponse.findMany.mockResolvedValue([]);
      prismaMock.engagementAggregate.findMany.mockResolvedValue([]);

      const report = await getWeeklyReport("child-1");

      expect(report.encouragement).toBeTruthy();
      expect(typeof report.encouragement).toBe("string");
    });

    it("encouragement mentions mastery when skills mastered", async () => {
      prismaMock.user.findUniqueOrThrow.mockResolvedValue(mockUser as any);
      prismaMock.problemResponse.findMany.mockResolvedValue([]);
      prismaMock.engagementAggregate.findMany.mockResolvedValue([]);

      const report = await getWeeklyReport("child-1");

      // newlyMastered.length > 0, so encouragement should mention it
      expect(report.encouragement).toContain("Mastered");
    });

    it("calculates time invested from engagement aggregates", async () => {
      prismaMock.user.findUniqueOrThrow.mockResolvedValue(mockUser as any);
      prismaMock.problemResponse.findMany.mockResolvedValue([]);
      prismaMock.engagementAggregate.findMany.mockResolvedValue([
        { date: new Date(), activeMinutes: 20, studentId: "child-1" },
        { date: new Date(), activeMinutes: 30, studentId: "child-1" },
      ] as any);

      const report = await getWeeklyReport("child-1");

      expect(report.timeInvested).toBe(50);
    });
  });
});
