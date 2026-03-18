/**
 * Tests for the answer checker and normalizer.
 */

import { describe, it, expect } from "vitest";
import { checkAnswer, normalizeAnswer, numericEquals } from "../answer-checker";

describe("Answer Checker", () => {
  // ─── normalizeAnswer ────────────────────────────────────────

  describe("normalizeAnswer", () => {
    it("trims whitespace", () => {
      expect(normalizeAnswer("  hello  ")).toBe("hello");
    });

    it("lowercases", () => {
      expect(normalizeAnswer("HELLO")).toBe("hello");
    });

    it("strips dollar signs", () => {
      expect(normalizeAnswer("$42$")).toBe("42");
    });

    it("removes commas from numbers", () => {
      expect(normalizeAnswer("3,266")).toBe("3266");
    });

    it("normalizes whitespace around operators", () => {
      expect(normalizeAnswer("3 + 4")).toBe("3+4");
      expect(normalizeAnswer("x = 5")).toBe("x=5");
    });

    it("collapses multiple spaces", () => {
      expect(normalizeAnswer("hello   world")).toBe("hello world");
    });

    it("handles combined normalizations", () => {
      expect(normalizeAnswer("  $3,266 + 1,000$  ")).toBe("3266+1000");
    });
  });

  // ─── numericEquals ──────────────────────────────────────────

  describe("numericEquals", () => {
    it("matches equal numbers", () => {
      expect(numericEquals("42", "42")).toBe(true);
    });

    it("matches 0.5 and .5", () => {
      expect(numericEquals("0.5", ".5")).toBe(true);
    });

    it("matches 0.50 and 0.5", () => {
      expect(numericEquals("0.50", "0.5")).toBe(true);
    });

    it("returns false for non-numeric strings", () => {
      expect(numericEquals("abc", "def")).toBe(false);
    });

    it("returns false for different numbers", () => {
      expect(numericEquals("42", "43")).toBe(false);
    });
  });

  // ─── checkAnswer ────────────────────────────────────────────

  describe("checkAnswer", () => {
    it("matches exact normalized answer", () => {
      expect(checkAnswer("42", "42")).toBe(true);
    });

    it("matches with different whitespace/case", () => {
      expect(checkAnswer("  HELLO  ", "hello")).toBe(true);
    });

    it("matches acceptable formats", () => {
      expect(checkAnswer("1/2", "0.5", ["1/2", "one half"])).toBe(true);
    });

    it("matches via numeric equality", () => {
      expect(checkAnswer("0.50", "0.5")).toBe(true);
    });

    it("returns false for wrong answer", () => {
      expect(checkAnswer("41", "42")).toBe(false);
    });

    it("handles comma-formatted numbers", () => {
      expect(checkAnswer("3,266", "3266")).toBe(true);
    });

    it("handles dollar-sign wrapped answers", () => {
      expect(checkAnswer("$42$", "42")).toBe(true);
    });
  });
});
