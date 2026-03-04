/**
 * Trust Affirmation — Per-action-class graduated autonomy tracking.
 *
 * Sprint 2D: Trust grows through demonstrated reliability on SPECIFIC
 * action types, not an overall score. An agent might earn Level 4
 * autonomy for read operations while remaining Level 2 for purchases.
 *
 * Trust levels (based on roadmap reversibility tiers):
 *   Level 1: < 5 actions attempted (new/unproven)
 *   Level 2: 5+ actions, >= 60% correct (emerging)
 *   Level 3: 15+ actions, >= 75% correct (reliable)
 *   Level 4: 30+ actions, >= 85% correct (trusted)
 *   Level 5: 50+ actions, >= 90% correct (autonomous)
 */

import { db } from "./db.js";

// ─── Action Class Mapping ────────────────────────────────────

/**
 * Map capability level to action class for trust tracking.
 *
 * Higher levels involve higher-stakes actions:
 *   L0-L1: read_only (listing tools, reading files)
 *   L2: reversible_write (chaining tools, creating files)
 *   L3: planning (task decomposition, resource estimation)
 *   L4: collaboration (human interaction, presenting options)
 *   L5+: meta (self-expansion, building tools)
 */
export function actionClassFromLevel(level: number): string {
  if (level <= 1) return "read_only";
  if (level === 2) return "reversible_write";
  if (level === 3) return "planning";
  if (level === 4) return "collaboration";
  return "meta";
}

// ─── Trust Level Computation ─────────────────────────────────

interface TrustThreshold {
  minActions: number;
  minAccuracy: number;
}

const TRUST_THRESHOLDS: TrustThreshold[] = [
  { minActions: 0, minAccuracy: 0 },     // Level 1: default
  { minActions: 5, minAccuracy: 0.60 },   // Level 2: emerging
  { minActions: 15, minAccuracy: 0.75 },  // Level 3: reliable
  { minActions: 30, minAccuracy: 0.85 },  // Level 4: trusted
  { minActions: 50, minAccuracy: 0.90 },  // Level 5: autonomous
];

function computeTrustLevel(totalActions: number, correctActions: number): number {
  const accuracy = totalActions > 0 ? correctActions / totalActions : 0;

  let level = 1;
  for (let i = TRUST_THRESHOLDS.length - 1; i >= 1; i--) {
    const t = TRUST_THRESHOLDS[i];
    if (totalActions >= t.minActions && accuracy >= t.minAccuracy) {
      level = i + 1;
      break;
    }
  }
  return level;
}

// ─── Public API ──────────────────────────────────────────────

/**
 * Update trust state after a task attempt.
 */
export async function updateTrust(
  agentId: string,
  actionClass: string,
  correct: boolean,
): Promise<{ trustLevel: number; totalActions: number; accuracy: number }> {
  const existing = await db.trustState.findUnique({
    where: { agentId_actionClass: { agentId, actionClass } },
  });

  const totalActions = (existing?.totalActions ?? 0) + 1;
  const correctActions = (existing?.correctActions ?? 0) + (correct ? 1 : 0);
  const trustLevel = computeTrustLevel(totalActions, correctActions);

  await db.trustState.upsert({
    where: { agentId_actionClass: { agentId, actionClass } },
    create: {
      agentId,
      actionClass,
      totalActions: 1,
      correctActions: correct ? 1 : 0,
      trustLevel,
      lastActionAt: new Date(),
    },
    update: {
      totalActions: { increment: 1 },
      correctActions: correct ? { increment: 1 } : undefined,
      trustLevel,
      lastActionAt: new Date(),
    },
  });

  return {
    trustLevel,
    totalActions,
    accuracy: totalActions > 0 ? correctActions / totalActions : 0,
  };
}

/**
 * Get the full trust profile for an agent.
 */
export async function getTrustProfile(
  agentId: string,
): Promise<Array<{ actionClass: string; trustLevel: number; totalActions: number; accuracy: number }>> {
  const states = await db.trustState.findMany({
    where: { agentId },
    orderBy: { actionClass: "asc" },
  });

  return states.map((s) => ({
    actionClass: s.actionClass,
    trustLevel: s.trustLevel,
    totalActions: s.totalActions,
    accuracy: s.totalActions > 0 ? s.correctActions / s.totalActions : 0,
  }));
}
