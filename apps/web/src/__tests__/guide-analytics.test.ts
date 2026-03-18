/**
 * Tests for guide analytics queries.
 *
 * Uses mocked Prisma client. Tests the data aggregation logic.
 */

import { describe, it, expect } from "vitest";
import { prismaMock } from "./setup";
import { getClassroomAnalytics } from "../lib/guide-analytics";
import { MASTERY_THRESHOLD } from "@primer/shared";

describe("Guide Analytics", () => {
  describe("getClassroomAnalytics", () => {
    const mockClassroom = {
      id: "class-1",
      name: "Math 5A",
      guideId: "guide-1",
      courseId: "course-1",
      joinCode: "ABC123",
      description: null,
      archived: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      members: [
        { student: { id: "student-1", name: "Alice" }, studentId: "student-1", classroomId: "class-1", joinedAt: new Date() },
        { student: { id: "student-2", name: "Bob" }, studentId: "student-2", classroomId: "class-1", joinedAt: new Date() },
      ],
    };

    it("returns classroom analytics with student summaries", async () => {
      prismaMock.classroom.findUniqueOrThrow.mockResolvedValue(mockClassroom as any);
      prismaMock.studentMasteryState.findMany.mockResolvedValue([
        {
          studentId: "student-1",
          kcId: "kc-1",
          pMastery: 0.96,
          totalAttempts: 10,
          correctCount: 9,
          kc: { id: "kc-1", name: "Addition" },
        },
        {
          studentId: "student-2",
          kcId: "kc-1",
          pMastery: 0.3,
          totalAttempts: 8,
          correctCount: 3,
          kc: { id: "kc-1", name: "Addition" },
        },
      ] as any);
      prismaMock.problemResponse.findMany.mockResolvedValue([]);
      (prismaMock.problemResponse.groupBy as any).mockResolvedValue([]);

      const result = await getClassroomAnalytics("class-1");

      expect(result.classroomId).toBe("class-1");
      expect(result.classroomName).toBe("Math 5A");
      expect(result.studentCount).toBe(2);
      expect(result.students).toHaveLength(2);
    });

    it("detects struggling students (low mastery + high attempts)", async () => {
      prismaMock.classroom.findUniqueOrThrow.mockResolvedValue({
        ...mockClassroom,
        members: [
          { student: { id: "student-1", name: "Alice" }, studentId: "student-1", classroomId: "class-1", joinedAt: new Date() },
        ],
      } as any);

      // Student has 2 KCs with low mastery and high attempts (struggling)
      prismaMock.studentMasteryState.findMany.mockResolvedValue([
        {
          studentId: "student-1",
          kcId: "kc-1",
          pMastery: 0.2,
          totalAttempts: 10,
          correctCount: 3,
          kc: { id: "kc-1", name: "Addition" },
        },
        {
          studentId: "student-1",
          kcId: "kc-2",
          pMastery: 0.15,
          totalAttempts: 8,
          correctCount: 2,
          kc: { id: "kc-2", name: "Subtraction" },
        },
      ] as any);
      prismaMock.problemResponse.findMany.mockResolvedValue([
        { studentId: "student-1", createdAt: new Date() },
      ] as any);
      (prismaMock.problemResponse.groupBy as any).mockResolvedValue([]);

      const result = await getClassroomAnalytics("class-1");

      const alice = result.students.find((s) => s.studentId === "student-1");
      expect(alice?.strugglingKCs).toBe(2);
      expect(alice?.status).toBe("struggling");
      expect(result.strugglingCount).toBe(1);
    });

    it("builds KC heatmap with struggling topic detection", async () => {
      prismaMock.classroom.findUniqueOrThrow.mockResolvedValue({
        ...mockClassroom,
        members: [
          { student: { id: "s1", name: "A" }, studentId: "s1", classroomId: "class-1", joinedAt: new Date() },
          { student: { id: "s2", name: "B" }, studentId: "s2", classroomId: "class-1", joinedAt: new Date() },
          { student: { id: "s3", name: "C" }, studentId: "s3", classroomId: "class-1", joinedAt: new Date() },
        ],
      } as any);

      // 3 students with low mastery on kc-1 = struggling topic
      prismaMock.studentMasteryState.findMany.mockResolvedValue([
        { studentId: "s1", kcId: "kc-1", pMastery: 0.2, totalAttempts: 5, correctCount: 1, kc: { id: "kc-1", name: "Fractions" } },
        { studentId: "s2", kcId: "kc-1", pMastery: 0.3, totalAttempts: 6, correctCount: 2, kc: { id: "kc-1", name: "Fractions" } },
        { studentId: "s3", kcId: "kc-1", pMastery: 0.15, totalAttempts: 4, correctCount: 1, kc: { id: "kc-1", name: "Fractions" } },
      ] as any);
      prismaMock.problemResponse.findMany.mockResolvedValue([]);
      (prismaMock.problemResponse.groupBy as any).mockResolvedValue([]);

      const result = await getClassroomAnalytics("class-1");

      const fractionsKC = result.kcHeatmap.find((kc) => kc.kcId === "kc-1");
      expect(fractionsKC).toBeDefined();
      expect(fractionsKC!.isStrugglingTopic).toBe(true);
      expect(fractionsKC!.averageMastery).toBeLessThan(0.5);
      expect(fractionsKC!.attemptedCount).toBe(3);
    });

    it("identifies idle students (no KCs)", async () => {
      prismaMock.classroom.findUniqueOrThrow.mockResolvedValue({
        ...mockClassroom,
        members: [
          { student: { id: "student-1", name: "Alice" }, studentId: "student-1", classroomId: "class-1", joinedAt: new Date() },
        ],
      } as any);
      prismaMock.studentMasteryState.findMany.mockResolvedValue([]);
      prismaMock.problemResponse.findMany.mockResolvedValue([]);
      (prismaMock.problemResponse.groupBy as any).mockResolvedValue([]);

      const result = await getClassroomAnalytics("class-1");

      expect(result.students[0].status).toBe("idle");
      expect(result.idleCount).toBe(1);
    });

    it("identifies completed students", async () => {
      prismaMock.classroom.findUniqueOrThrow.mockResolvedValue({
        ...mockClassroom,
        members: [
          { student: { id: "student-1", name: "Alice" }, studentId: "student-1", classroomId: "class-1", joinedAt: new Date() },
        ],
      } as any);
      prismaMock.studentMasteryState.findMany.mockResolvedValue([
        {
          studentId: "student-1",
          kcId: "kc-1",
          pMastery: 0.98,
          totalAttempts: 10,
          correctCount: 9,
          kc: { id: "kc-1", name: "Addition" },
        },
      ] as any);
      prismaMock.problemResponse.findMany.mockResolvedValue([
        { studentId: "student-1", createdAt: new Date() },
      ] as any);
      (prismaMock.problemResponse.groupBy as any).mockResolvedValue([]);

      const result = await getClassroomAnalytics("class-1");

      expect(result.students[0].masteredKCs).toBe(1);
      expect(result.students[0].totalKCs).toBe(1);
      // All KCs mastered + recent activity = completed
      expect(result.students[0].status).toBe("completed");
    });
  });
});
