/**
 * Tests for shared constants.
 */

import { describe, it, expect } from "vitest";
import {
  MASTERY_THRESHOLD,
  DEFAULT_BKT_PARAMS,
  TARGET_RETENTION,
  MAX_TUTOR_TURNS,
  IDLE_THRESHOLDS,
} from "../constants";

describe("Constants", () => {
  it("MASTERY_THRESHOLD is 0.95", () => {
    expect(MASTERY_THRESHOLD).toBe(0.95);
  });

  it("DEFAULT_BKT_PARAMS has expected values", () => {
    expect(DEFAULT_BKT_PARAMS.pInit).toBe(0.1);
    expect(DEFAULT_BKT_PARAMS.pTransit).toBe(0.2);
    expect(DEFAULT_BKT_PARAMS.pSlip).toBe(0.1);
    expect(DEFAULT_BKT_PARAMS.pGuess).toBe(0.25);
  });

  it("TARGET_RETENTION is 0.9", () => {
    expect(TARGET_RETENTION).toBe(0.9);
  });

  it("MAX_TUTOR_TURNS is a reasonable positive number", () => {
    expect(MAX_TUTOR_TURNS).toBeGreaterThan(0);
    expect(MAX_TUTOR_TURNS).toBe(15);
  });

  it("IDLE_THRESHOLDS are in ascending order", () => {
    expect(IDLE_THRESHOLDS.potentiallyIdle).toBeLessThan(IDLE_THRESHOLDS.idle);
    expect(IDLE_THRESHOLDS.idle).toBeLessThan(IDLE_THRESHOLDS.sessionTimeout);
  });

  it("BKT params sum check: pSlip + pGuess < 1", () => {
    expect(DEFAULT_BKT_PARAMS.pSlip + DEFAULT_BKT_PARAMS.pGuess).toBeLessThan(1);
  });
});
