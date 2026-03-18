/**
 * Tests for the FSRS (Free Spaced Repetition Scheduler) engine.
 */

import { describe, it, expect } from "vitest";
import {
  createNewCard,
  performanceToRating,
  ratingToFsrs,
  processReview,
  getRetrievability,
  isDue,
  countDueCards,
  type FsrsCardData,
} from "../fsrs";
import { Rating, State } from "ts-fsrs";

describe("FSRS Engine", () => {
  // ─── createNewCard ──────────────────────────────────────────

  describe("createNewCard", () => {
    it("creates a card in New state", () => {
      const card = createNewCard();
      expect(card.state).toBe(State.New);
      expect(card.reps).toBe(0);
      expect(card.lapses).toBe(0);
    });

    it("uses provided date for due date", () => {
      const date = new Date("2025-01-15T10:00:00Z");
      const card = createNewCard(date);
      expect(new Date(card.dueDate).toISOString()).toBe(date.toISOString());
    });

    it("initializes stability and difficulty", () => {
      const card = createNewCard();
      expect(card.stability).toBeDefined();
      expect(card.difficulty).toBeDefined();
    });

    it("has null lastReviewAt", () => {
      const card = createNewCard();
      expect(card.lastReviewAt).toBeNull();
    });
  });

  // ─── performanceToRating ────────────────────────────────────

  describe("performanceToRating", () => {
    it('returns "again" when incorrect', () => {
      expect(performanceToRating(false, 0, 1, 5000)).toBe("again");
    });

    it('returns "hard" when hints were used', () => {
      expect(performanceToRating(true, 1, 1, 5000)).toBe("hard");
    });

    it('returns "hard" when multiple attempts needed', () => {
      expect(performanceToRating(true, 0, 2, 5000)).toBe("hard");
    });

    it('returns "easy" for fast first-try correct', () => {
      expect(performanceToRating(true, 0, 1, 5000)).toBe("easy");
    });

    it('returns "good" for slower first-try correct', () => {
      expect(performanceToRating(true, 0, 1, 15000)).toBe("good");
    });

    it('returns "easy" at exactly under 10 seconds', () => {
      expect(performanceToRating(true, 0, 1, 9999)).toBe("easy");
    });

    it('returns "good" at exactly 10 seconds', () => {
      expect(performanceToRating(true, 0, 1, 10000)).toBe("good");
    });

    it('returns "again" regardless of hints/speed when incorrect', () => {
      expect(performanceToRating(false, 3, 5, 1000)).toBe("again");
    });
  });

  // ─── ratingToFsrs ──────────────────────────────────────────

  describe("ratingToFsrs", () => {
    it("maps again to Rating.Again", () => {
      expect(ratingToFsrs("again")).toBe(Rating.Again);
    });

    it("maps hard to Rating.Hard", () => {
      expect(ratingToFsrs("hard")).toBe(Rating.Hard);
    });

    it("maps good to Rating.Good", () => {
      expect(ratingToFsrs("good")).toBe(Rating.Good);
    });

    it("maps easy to Rating.Easy", () => {
      expect(ratingToFsrs("easy")).toBe(Rating.Easy);
    });
  });

  // ─── processReview ──────────────────────────────────────────

  describe("processReview", () => {
    it("processes a review and returns updated card", () => {
      const card = createNewCard(new Date("2025-01-01T00:00:00Z"));
      const now = new Date("2025-01-01T00:10:00Z");
      const result = processReview(card, "good", now);

      expect(result.card).toBeDefined();
      expect(result.rating).toBe(Rating.Good);
      expect(result.nextDue).toBeInstanceOf(Date);
      expect(result.intervalDescription).toBeTruthy();
    });

    it("detects a lapse when a Review card gets Again", () => {
      // Simulate a card in Review state
      const card = createNewCard(new Date("2025-01-01"));
      // Process through learning steps to get to Review state
      let current = card;
      const times = [
        new Date("2025-01-01T00:10:00Z"),
        new Date("2025-01-02T00:00:00Z"),
        new Date("2025-01-05T00:00:00Z"),
      ];
      for (const t of times) {
        const result = processReview(current, "good", t);
        current = result.card;
      }

      // Now the card should be in Review state — mark it Again
      if (current.state === State.Review) {
        const lapseResult = processReview(
          current,
          "again",
          new Date("2025-01-15T00:00:00Z")
        );
        expect(lapseResult.isLapse).toBe(true);
      }
    });

    it("is not a lapse when a New card gets Again", () => {
      const card = createNewCard(new Date("2025-01-01"));
      const result = processReview(card, "again", new Date("2025-01-01T00:10:00Z"));
      expect(result.isLapse).toBe(false);
    });

    it("advances card state through learning steps", () => {
      const card = createNewCard(new Date("2025-01-01"));
      const r1 = processReview(card, "good", new Date("2025-01-01T00:10:00Z"));
      // After first review, card should have moved from New
      expect(r1.card.reps).toBeGreaterThan(0);
    });
  });

  // ─── getRetrievability ──────────────────────────────────────

  describe("getRetrievability", () => {
    it("returns 1 for New state cards", () => {
      const card = createNewCard();
      card.state = State.New as number;
      expect(getRetrievability(card)).toBe(1);
    });

    it("returns 1 when lastReviewAt is null", () => {
      const card = createNewCard();
      card.state = State.Review as number;
      card.lastReviewAt = null;
      expect(getRetrievability(card)).toBe(1);
    });

    it("returns 1 when checked at review time", () => {
      const now = new Date("2025-01-15T10:00:00Z");
      const card: FsrsCardData = {
        state: State.Review as number,
        stability: 10,
        difficulty: 5,
        reps: 3,
        lapses: 0,
        dueDate: new Date("2025-01-25"),
        lastReviewAt: now,
        scheduledDays: 10,
        learningSteps: 0,
      };
      expect(getRetrievability(card, now)).toBe(1);
    });

    it("decreases over time", () => {
      const reviewDate = new Date("2025-01-01T00:00:00Z");
      const card: FsrsCardData = {
        state: State.Review as number,
        stability: 10,
        difficulty: 5,
        reps: 3,
        lapses: 0,
        dueDate: new Date("2025-01-11"),
        lastReviewAt: reviewDate,
        scheduledDays: 10,
        learningSteps: 0,
      };

      const r1 = getRetrievability(card, new Date("2025-01-05"));
      const r2 = getRetrievability(card, new Date("2025-01-10"));
      const r3 = getRetrievability(card, new Date("2025-01-20"));

      expect(r1).toBeGreaterThan(r2);
      expect(r2).toBeGreaterThan(r3);
    });

    it("is between 0 and 1", () => {
      const card: FsrsCardData = {
        state: State.Review as number,
        stability: 5,
        difficulty: 7,
        reps: 5,
        lapses: 1,
        dueDate: new Date("2025-01-06"),
        lastReviewAt: new Date("2025-01-01"),
        scheduledDays: 5,
        learningSteps: 0,
      };
      const r = getRetrievability(card, new Date("2025-06-01"));
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(1);
    });

    it("returns 0 when stability is 0", () => {
      const card: FsrsCardData = {
        state: State.Review as number,
        stability: 0,
        difficulty: 5,
        reps: 1,
        lapses: 0,
        dueDate: new Date("2025-01-02"),
        lastReviewAt: new Date("2025-01-01"),
        scheduledDays: 1,
        learningSteps: 0,
      };
      expect(getRetrievability(card, new Date("2025-01-05"))).toBe(0);
    });
  });

  // ─── isDue / countDueCards ──────────────────────────────────

  describe("isDue", () => {
    it("returns true when due date is in the past", () => {
      const card = createNewCard(new Date("2025-01-01"));
      expect(isDue(card, new Date("2025-01-02"))).toBe(true);
    });

    it("returns false when due date is in the future", () => {
      const card = createNewCard(new Date("2025-01-10"));
      expect(isDue(card, new Date("2025-01-05"))).toBe(false);
    });

    it("returns true when due date equals now", () => {
      const now = new Date("2025-01-01T10:00:00Z");
      const card = createNewCard(now);
      expect(isDue(card, now)).toBe(true);
    });
  });

  describe("countDueCards", () => {
    it("counts due cards correctly", () => {
      const now = new Date("2025-01-15");
      const cards: FsrsCardData[] = [
        createNewCard(new Date("2025-01-10")), // due
        createNewCard(new Date("2025-01-14")), // due
        createNewCard(new Date("2025-01-20")), // not due
      ];
      expect(countDueCards(cards, now)).toBe(2);
    });

    it("returns 0 for empty array", () => {
      expect(countDueCards([])).toBe(0);
    });
  });
});
