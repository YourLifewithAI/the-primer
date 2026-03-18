/**
 * Tests for the FSRS service (database layer).
 *
 * Uses mocked Prisma client. Exercises the service's database interaction
 * patterns without actually hitting a database.
 */

import { describe, it, expect } from "vitest";
import { prismaMock } from "./setup";
import { createFsrsCard, reviewCard } from "../lib/fsrs-service";
import { FsrsState as State } from "@primer/shared";

describe("FSRS Service", () => {
  // ─── createFsrsCard ─────────────────────────────────────────

  describe("createFsrsCard", () => {
    it("upserts a new card for the student-KC pair", async () => {
      prismaMock.fsrsCardState.upsert.mockResolvedValue({} as any);

      await createFsrsCard("student-1", "kc-1");

      expect(prismaMock.fsrsCardState.upsert).toHaveBeenCalledWith({
        where: { studentId_kcId: { studentId: "student-1", kcId: "kc-1" } },
        create: expect.objectContaining({
          studentId: "student-1",
          kcId: "kc-1",
          state: State.New,
          reps: 0,
          lapses: 0,
        }),
        update: expect.objectContaining({
          state: State.New,
          reps: 0,
          lapses: 0,
        }),
      });
    });
  });

  // ─── reviewCard ─────────────────────────────────────────────

  describe("reviewCard", () => {
    it("throws when no card exists", async () => {
      prismaMock.fsrsCardState.findUnique.mockResolvedValue(null);

      await expect(reviewCard("student-1", "kc-1", "good")).rejects.toThrow(
        "No FSRS card found"
      );
    });

    it("processes a review and updates the card", async () => {
      const mockCard = {
        id: "card-1",
        studentId: "student-1",
        kcId: "kc-1",
        state: State.New,
        stability: 0,
        difficulty: 0,
        reps: 0,
        lapses: 0,
        dueDate: new Date("2025-01-01"),
        lastReviewAt: null,
        scheduledDays: 0,
        learningSteps: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prismaMock.fsrsCardState.findUnique.mockResolvedValue(mockCard as any);
      prismaMock.fsrsCardState.update.mockResolvedValue({} as any);

      const result = await reviewCard("student-1", "kc-1", "good");

      expect(result.kcId).toBe("kc-1");
      expect(prismaMock.fsrsCardState.update).toHaveBeenCalledOnce();
    });

    it("resets BKT mastery on lapse", async () => {
      // Card in Review state
      const mockCard = {
        id: "card-1",
        studentId: "student-1",
        kcId: "kc-1",
        state: State.Review,
        stability: 10,
        difficulty: 5,
        reps: 5,
        lapses: 0,
        dueDate: new Date("2025-01-01"),
        lastReviewAt: new Date("2024-12-20"),
        scheduledDays: 12,
        learningSteps: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockMastery = {
        id: "mastery-1",
        studentId: "student-1",
        kcId: "kc-1",
        pMastery: 0.96,
        pInit: 0.1,
        pTransit: 0.2,
        pSlip: 0.1,
        pGuess: 0.25,
        totalAttempts: 10,
        correctCount: 9,
        lastAttemptAt: new Date(),
        masteredAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prismaMock.fsrsCardState.findUnique.mockResolvedValue(mockCard as any);
      prismaMock.fsrsCardState.update.mockResolvedValue({} as any);
      prismaMock.studentMasteryState.findUnique.mockResolvedValue(mockMastery as any);
      prismaMock.studentMasteryState.update.mockResolvedValue({} as any);

      const result = await reviewCard("student-1", "kc-1", "again");

      // A Review card with Again = lapse
      expect(result.isLapse).toBe(true);
      // Should have attempted to reduce BKT mastery
      expect(prismaMock.studentMasteryState.findUnique).toHaveBeenCalled();
      expect(prismaMock.studentMasteryState.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            pMastery: 0.85,
            masteredAt: null,
          }),
        })
      );
    });

    it("does not reset BKT when non-lapse review", async () => {
      const mockCard = {
        id: "card-1",
        studentId: "student-1",
        kcId: "kc-1",
        state: State.New,
        stability: 0,
        difficulty: 0,
        reps: 0,
        lapses: 0,
        dueDate: new Date("2025-01-01"),
        lastReviewAt: null,
        scheduledDays: 0,
        learningSteps: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prismaMock.fsrsCardState.findUnique.mockResolvedValue(mockCard as any);
      prismaMock.fsrsCardState.update.mockResolvedValue({} as any);

      await reviewCard("student-1", "kc-1", "good");

      // Non-lapse: should not touch studentMasteryState
      expect(prismaMock.studentMasteryState.findUnique).not.toHaveBeenCalled();
    });
  });
});
