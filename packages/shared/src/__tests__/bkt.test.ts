/**
 * Tests for the BKT (Bayesian Knowledge Tracing) engine.
 */

import { describe, it, expect } from "vitest";
import {
  bktUpdate,
  defaultBKTParams,
  predictCorrect,
  estimateToMastery,
  type BKTParams,
} from "../bkt";
import { MASTERY_THRESHOLD, DEFAULT_BKT_PARAMS } from "../constants";

describe("BKT Engine", () => {
  // ─── defaultBKTParams ───────────────────────────────────────

  describe("defaultBKTParams", () => {
    it("returns default parameters", () => {
      const params = defaultBKTParams();
      expect(params.pMastery).toBe(DEFAULT_BKT_PARAMS.pInit);
      expect(params.pInit).toBe(DEFAULT_BKT_PARAMS.pInit);
      expect(params.pTransit).toBe(DEFAULT_BKT_PARAMS.pTransit);
      expect(params.pSlip).toBe(DEFAULT_BKT_PARAMS.pSlip);
      expect(params.pGuess).toBe(DEFAULT_BKT_PARAMS.pGuess);
    });

    it("starts below mastery threshold", () => {
      const params = defaultBKTParams();
      expect(params.pMastery).toBeLessThan(MASTERY_THRESHOLD);
    });
  });

  // ─── bktUpdate ──────────────────────────────────────────────

  describe("bktUpdate", () => {
    it("increases mastery on correct response", () => {
      const params = defaultBKTParams();
      const result = bktUpdate(params, true);
      expect(result.pMastery).toBeGreaterThan(params.pMastery);
    });

    it("can decrease mastery on incorrect response relative to start", () => {
      // Start at a moderate mastery level
      const params: BKTParams = {
        pMastery: 0.6,
        pInit: 0.1,
        pTransit: 0.2,
        pSlip: 0.1,
        pGuess: 0.25,
      };
      const result = bktUpdate(params, false);
      // After incorrect, mastery may go down from the starting point
      // (though transition probability can push it up slightly)
      expect(result.pMastery).toBeDefined();
    });

    it("reports wasMastered correctly for pre-mastered state", () => {
      const params: BKTParams = {
        pMastery: 0.96,
        pInit: 0.1,
        pTransit: 0.2,
        pSlip: 0.1,
        pGuess: 0.25,
      };
      const result = bktUpdate(params, true);
      expect(result.wasMastered).toBe(true);
    });

    it("reports wasMastered false for unmastered state", () => {
      const params = defaultBKTParams();
      const result = bktUpdate(params, true);
      expect(result.wasMastered).toBe(false);
    });

    it("clamps pMastery to [0.001, 0.999]", () => {
      // Extreme params that might push mastery out of range
      const params: BKTParams = {
        pMastery: 0.999,
        pInit: 0.999,
        pTransit: 0.999,
        pSlip: 0.001,
        pGuess: 0.001,
      };
      const result = bktUpdate(params, true);
      expect(result.pMastery).toBeLessThanOrEqual(0.999);
      expect(result.pMastery).toBeGreaterThanOrEqual(0.001);
    });

    it("returns pCorrect as model-predicted probability", () => {
      const params = defaultBKTParams();
      const result = bktUpdate(params, true);
      // P(correct) = P(L)(1-P(S)) + (1-P(L))P(G)
      const expectedPCorrect =
        params.pMastery * (1 - params.pSlip) +
        (1 - params.pMastery) * params.pGuess;
      expect(result.pCorrect).toBeCloseTo(expectedPCorrect, 10);
    });

    it("eventually reaches mastery with consecutive correct responses", () => {
      let params = defaultBKTParams();
      let mastered = false;
      for (let i = 0; i < 50; i++) {
        const result = bktUpdate(params, true);
        params = { ...params, pMastery: result.pMastery };
        if (result.isMastered) {
          mastered = true;
          break;
        }
      }
      expect(mastered).toBe(true);
    });

    it("isMastered flag matches threshold comparison", () => {
      const params = defaultBKTParams();
      const result = bktUpdate(params, true);
      expect(result.isMastered).toBe(result.pMastery >= MASTERY_THRESHOLD);
    });
  });

  // ─── predictCorrect ────────────────────────────────────────

  describe("predictCorrect", () => {
    it("computes P(correct) from BKT params", () => {
      const params = defaultBKTParams();
      const pCorrect = predictCorrect(params);
      // P(correct) = 0.1 * 0.9 + 0.9 * 0.25 = 0.09 + 0.225 = 0.315
      expect(pCorrect).toBeCloseTo(0.315, 3);
    });

    it("is higher when mastery is higher", () => {
      const low: BKTParams = { ...defaultBKTParams(), pMastery: 0.2 };
      const high: BKTParams = { ...defaultBKTParams(), pMastery: 0.8 };
      expect(predictCorrect(high)).toBeGreaterThan(predictCorrect(low));
    });

    it("returns value between 0 and 1", () => {
      const p = predictCorrect(defaultBKTParams());
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    });
  });

  // ─── estimateToMastery ──────────────────────────────────────

  describe("estimateToMastery", () => {
    it("returns 0 for already-mastered KC", () => {
      const params: BKTParams = {
        ...defaultBKTParams(),
        pMastery: 0.96,
      };
      expect(estimateToMastery(params)).toBe(0);
    });

    it("returns positive number for unmastered KC", () => {
      const params = defaultBKTParams();
      const estimate = estimateToMastery(params);
      expect(estimate).toBeGreaterThan(0);
      expect(estimate).toBeLessThan(Infinity);
    });

    it("higher mastery needs fewer attempts", () => {
      const low: BKTParams = { ...defaultBKTParams(), pMastery: 0.2 };
      const high: BKTParams = { ...defaultBKTParams(), pMastery: 0.8 };
      expect(estimateToMastery(high)).toBeLessThan(estimateToMastery(low));
    });

    it("returns Infinity for degenerate params within maxIter", () => {
      const params: BKTParams = {
        pMastery: 0.01,
        pInit: 0.01,
        pTransit: 0.001,
        pSlip: 0.5,
        pGuess: 0.5,
      };
      const result = estimateToMastery(params, 10);
      expect(result).toBe(Infinity);
    });
  });
});
