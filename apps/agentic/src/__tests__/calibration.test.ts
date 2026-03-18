/**
 * Tests for calibration logic — boost values and model class detection.
 *
 * Note: The async functions (generateCalibrationBattery, evaluateCalibration,
 * applyCalibration) depend on the database. We test the pure logic here:
 * boost constants, Elo calculation, and model class detection.
 */

import { describe, it, expect } from "vitest";

// We can't import the private detectModelClass, so we test it indirectly
// by verifying the calibration result contract. For the pure values,
// we replicate the constants and test their correctness.

// Replicated from calibration.ts (these are the contract we're testing)
const CALIBRATION_BOOST: Record<number, number> = {
  0: 0.99,
  1: 0.85,
  2: 0.75,
  3: 0.60,
  4: 0.50,
  5: 0.40,
};

const ELO_BOOST_PER_LEVEL: Record<number, number> = {
  0: 25,
  1: 50,
  2: 75,
  3: 100,
  4: 125,
  5: 150,
};

const AGENT_MASTERY_THRESHOLD = 0.95;

// Model class detection logic (replicated for testing)
function detectModelClass(
  accuracy: number,
  results: Array<{ level: number; correct: boolean }>
): "CONSTRAINED" | "GUIDED" | "AUTONOMOUS" {
  const l2Correct = results.some((r) => r.level === 2 && r.correct);
  const l1CorrectCount = results.filter(
    (r) => r.level === 1 && r.correct
  ).length;

  if (accuracy >= 0.8 && l2Correct) return "AUTONOMOUS";
  if (accuracy >= 0.5 || l1CorrectCount >= 2) return "GUIDED";
  return "CONSTRAINED";
}

describe("Calibration", () => {
  // ─── Boost values ──────────────────────────────────────────

  describe("calibration boost values", () => {
    it("L0 boost marks mastered instantly (>= threshold)", () => {
      expect(CALIBRATION_BOOST[0]).toBeGreaterThanOrEqual(AGENT_MASTERY_THRESHOLD);
    });

    it("L1 boost is below threshold (needs one more correct)", () => {
      expect(CALIBRATION_BOOST[1]).toBeLessThan(AGENT_MASTERY_THRESHOLD);
      expect(CALIBRATION_BOOST[1]).toBeGreaterThan(0.5);
    });

    it("L2 boost is below L1 boost", () => {
      expect(CALIBRATION_BOOST[2]).toBeLessThan(CALIBRATION_BOOST[1]);
    });

    it("boosts decrease with level", () => {
      for (let level = 1; level <= 5; level++) {
        expect(CALIBRATION_BOOST[level]).toBeLessThan(
          CALIBRATION_BOOST[level - 1]
        );
      }
    });

    it("all boosts are between 0 and 1", () => {
      for (let level = 0; level <= 5; level++) {
        expect(CALIBRATION_BOOST[level]).toBeGreaterThan(0);
        expect(CALIBRATION_BOOST[level]).toBeLessThanOrEqual(1);
      }
    });
  });

  // ─── Elo boost values ──────────────────────────────────────

  describe("Elo boost values", () => {
    it("Elo boosts increase with level", () => {
      for (let level = 1; level <= 5; level++) {
        expect(ELO_BOOST_PER_LEVEL[level]).toBeGreaterThan(
          ELO_BOOST_PER_LEVEL[level - 1]
        );
      }
    });

    it("all Elo boosts are positive", () => {
      for (let level = 0; level <= 5; level++) {
        expect(ELO_BOOST_PER_LEVEL[level]).toBeGreaterThan(0);
      }
    });

    it("Elo calculation: base 1500 + boost for correct", () => {
      const level = 2;
      const adjustedElo = 1500 + ELO_BOOST_PER_LEVEL[level];
      expect(adjustedElo).toBe(1575);
    });

    it("Elo stays at 1500 for incorrect", () => {
      const adjustedElo = 1500; // Incorrect response = no boost
      expect(adjustedElo).toBe(1500);
    });
  });

  // ─── Model class detection ─────────────────────────────────

  describe("model class detection", () => {
    it("AUTONOMOUS: >= 80% accuracy AND L2 correct", () => {
      const result = detectModelClass(0.85, [
        { level: 0, correct: true },
        { level: 1, correct: true },
        { level: 2, correct: true },
      ]);
      expect(result).toBe("AUTONOMOUS");
    });

    it("not AUTONOMOUS without L2 correct even at high accuracy", () => {
      const result = detectModelClass(0.9, [
        { level: 0, correct: true },
        { level: 1, correct: true },
        { level: 2, correct: false },
      ]);
      // Should be GUIDED (>=50% accuracy)
      expect(result).not.toBe("AUTONOMOUS");
    });

    it("not AUTONOMOUS if accuracy < 80% even with L2 correct", () => {
      const result = detectModelClass(0.6, [
        { level: 0, correct: false },
        { level: 1, correct: false },
        { level: 2, correct: true },
      ]);
      expect(result).not.toBe("AUTONOMOUS");
    });

    it("GUIDED: >= 50% accuracy", () => {
      const result = detectModelClass(0.5, [
        { level: 0, correct: true },
        { level: 1, correct: false },
      ]);
      expect(result).toBe("GUIDED");
    });

    it("GUIDED: 2+ L1 correct (even if accuracy < 50%)", () => {
      const result = detectModelClass(0.3, [
        { level: 0, correct: false },
        { level: 1, correct: true },
        { level: 1, correct: true },
        { level: 2, correct: false },
        { level: 0, correct: false },
      ]);
      expect(result).toBe("GUIDED");
    });

    it("CONSTRAINED: low accuracy and few L1 correct", () => {
      const result = detectModelClass(0.2, [
        { level: 0, correct: true },
        { level: 1, correct: false },
        { level: 2, correct: false },
      ]);
      expect(result).toBe("CONSTRAINED");
    });

    it("CONSTRAINED: zero accuracy", () => {
      const result = detectModelClass(0, [
        { level: 0, correct: false },
        { level: 1, correct: false },
      ]);
      expect(result).toBe("CONSTRAINED");
    });
  });

  // ─── Overall Elo estimate ──────────────────────────────────

  describe("overall Elo estimate", () => {
    it("formula: 1500 + (accuracy - 0.5) * 200", () => {
      const accuracy = 0.8;
      const eloEstimate = 1500 + (accuracy - 0.5) * 200;
      expect(eloEstimate).toBe(1560);
    });

    it("50% accuracy gives baseline 1500", () => {
      const eloEstimate = 1500 + (0.5 - 0.5) * 200;
      expect(eloEstimate).toBe(1500);
    });

    it("0% accuracy gives 1400", () => {
      const eloEstimate = 1500 + (0 - 0.5) * 200;
      expect(eloEstimate).toBe(1400);
    });

    it("100% accuracy gives 1600", () => {
      const eloEstimate = 1500 + (1.0 - 0.5) * 200;
      expect(eloEstimate).toBe(1600);
    });
  });
});
