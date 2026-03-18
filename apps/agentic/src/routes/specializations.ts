/**
 * Specialization routes — Branch enrollment, prerequisite enforcement, and progress visualization.
 *
 * Sprint 2F: Research & Web Dev specialization stubs.
 *
 * Specializations are branches beyond Foundation (L0-L5). An agent must complete
 * Foundation L0-L4 before entering any specialization branch. Each branch has its
 * own capabilities with prerequisites that form a DAG.
 *
 * Routes:
 *   POST /specializations/:branch/enroll — Declare a specialization
 *   GET  /specializations — List available specializations
 *   GET  /specializations/progress — Full progress tree (Foundation + branches)
 */

import { Hono } from "hono";
import { db } from "../lib/db.js";
import { authMiddleware } from "../middleware/auth.js";
import type { AppEnv } from "../types.js";

/** Foundation levels 0-4 must be mastered to enter any specialization. */
const FOUNDATION_PREREQUISITE_MAX_LEVEL = 4;
const MASTERY_THRESHOLD = 0.95;

/** Known specialization branches and their metadata. */
const BRANCH_INFO: Record<string, { name: string; description: string }> = {
  research: {
    name: "Research Specialization",
    description:
      "Source evaluation, synthesis, literature review, and hypothesis formation. The skills that turn information into understanding.",
  },
  webdev: {
    name: "Web Development Specialization",
    description:
      "Component architecture, state management, API design, and performance diagnosis. The skills that turn requirements into maintainable software.",
  },
};

export const specializationRoutes = new Hono<AppEnv>();

/**
 * GET /specializations — List available specialization branches
 *
 * Public endpoint. Shows branches with their capabilities and prerequisite status
 * (if the agent is authenticated).
 */
specializationRoutes.get("/", async (c) => {
  // Try to get agent if auth header present (optional auth)
  let agentId: string | null = null;
  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const crypto = await import("node:crypto");
      const apiKey = authHeader.slice(7);
      const keyHash = crypto.createHash("sha256").update(apiKey).digest("hex");
      const agent = await db.agent.findUnique({ where: { apiKeyHash: keyHash } });
      if (agent) agentId = agent.id;
    } catch {
      // Not authenticated — that's fine for this endpoint
    }
  }

  const branches = [];

  for (const [branch, info] of Object.entries(BRANCH_INFO)) {
    const capabilities = await db.capability.findMany({
      where: { branch },
      orderBy: { level: "asc" },
      select: { slug: true, name: true, description: true, level: true },
    });

    let enrolled = false;
    let foundationComplete = false;

    if (agentId) {
      const enrollment = await db.specializationEnrollment.findUnique({
        where: { agentId_branch: { agentId, branch } },
      });
      enrolled = !!enrollment;
      foundationComplete = await checkFoundationComplete(agentId);
    }

    branches.push({
      branch,
      ...info,
      capabilities,
      ...(agentId
        ? {
            enrolled,
            foundationComplete,
            canEnroll: foundationComplete && !enrolled,
          }
        : {}),
    });
  }

  return c.json(branches);
});

/**
 * POST /specializations/:branch/enroll — Enroll in a specialization branch
 *
 * Prerequisites:
 *   - Must be enrolled in the Foundation course
 *   - Must have mastered all Foundation L0-L4 capabilities
 *   - Must not already be enrolled in this branch
 *
 * On enrollment:
 *   - Creates SpecializationEnrollment record
 *   - Initializes AgentMasteryState for all branch capabilities
 */
specializationRoutes.post("/:branch/enroll", authMiddleware, async (c) => {
  const agent = c.get("agent") as any;
  const branch = c.req.param("branch");

  // Validate branch exists
  if (!BRANCH_INFO[branch]) {
    return c.json(
      {
        error: `Unknown specialization branch: ${branch}`,
        available: Object.keys(BRANCH_INFO),
      },
      400
    );
  }

  // Check if already enrolled
  const existing = await db.specializationEnrollment.findUnique({
    where: { agentId_branch: { agentId: agent.id, branch } },
  });

  if (existing) {
    return c.json({
      message: "Already enrolled in this specialization",
      branch,
      status: existing.status,
      enrolledAt: existing.enrolledAt,
    });
  }

  // Check Foundation prerequisite: L0-L4 must be mastered
  const foundationComplete = await checkFoundationComplete(agent.id);
  if (!foundationComplete) {
    const unmastered = await getUnmasteredFoundation(agent.id);
    return c.json(
      {
        error: "Foundation prerequisite not met",
        message: `You must master all Foundation L0-L4 capabilities before entering a specialization.`,
        unmastered: unmastered.map((u) => ({
          capability: u.slug,
          name: u.name,
          level: u.level,
          pMastery: u.pMastery,
        })),
      },
      403
    );
  }

  // Get branch capabilities
  const branchCapabilities = await db.capability.findMany({
    where: { branch },
  });

  if (branchCapabilities.length === 0) {
    return c.json(
      {
        error: `No capabilities found for branch '${branch}'. Ensure specialization content is seeded.`,
      },
      500
    );
  }

  // Create enrollment
  const enrollment = await db.specializationEnrollment.create({
    data: {
      agentId: agent.id,
      branch,
    },
  });

  // Initialize mastery states for all branch capabilities
  await db.agentMasteryState.createMany({
    data: branchCapabilities.map((cap) => ({
      agentId: agent.id,
      capabilityId: cap.id,
      pMastery: 0.1,
      pInit: 0.1,
      pTransit: 0.2,
      pSlip: 0.1,
      pGuess: 0.05,
    })),
    skipDuplicates: true,
  });

  return c.json(
    {
      enrollmentId: enrollment.id,
      branch,
      branchName: BRANCH_INFO[branch].name,
      capabilities: branchCapabilities.length,
      message: `Enrolled in ${BRANCH_INFO[branch].name}. Use GET /tasks/next to start working on specialization tasks.`,
    },
    201
  );
});

/**
 * GET /specializations/progress — Full progress tree
 *
 * Returns the agent's complete skill tree: Foundation levels + specialization branches.
 * Includes mastery status, Elo ratings, and completion percentages per section.
 */
specializationRoutes.get("/progress", authMiddleware, async (c) => {
  const agent = c.get("agent") as any;

  // Get all mastery states with capability info
  const masteryStates = await db.agentMasteryState.findMany({
    where: { agentId: agent.id },
    include: {
      capability: {
        include: {
          prerequisites: {
            include: {
              prerequisite: { select: { slug: true, name: true, level: true, branch: true } },
            },
          },
        },
      },
    },
    orderBy: { capability: { level: "asc" } },
  });

  // Get specialization enrollments
  const specEnrollments = await db.specializationEnrollment.findMany({
    where: { agentId: agent.id },
  });
  const enrolledBranches = new Set(specEnrollments.map((e) => e.branch));

  // Organize into Foundation levels and specialization branches
  const foundation: Record<number, any[]> = {};
  const specializations: Record<string, any[]> = {};

  for (const ms of masteryStates) {
    const cap = ms.capability;
    const entry = {
      capability: cap.slug,
      name: cap.name,
      level: cap.level,
      pMastery: Math.round(ms.pMastery * 1000) / 1000,
      elo: { mu: Math.round(ms.eloMu), sigma: Math.round(ms.eloSigma) },
      mastered: ms.masteredAt !== null,
      masteredAt: ms.masteredAt,
      attempts: ms.totalAttempts,
      accuracy:
        ms.totalAttempts > 0
          ? Math.round((ms.correctCount / ms.totalAttempts) * 100)
          : null,
      prerequisites: cap.prerequisites.map((p: any) => p.prerequisite.slug),
    };

    if (cap.branch) {
      if (!specializations[cap.branch]) {
        specializations[cap.branch] = [];
      }
      specializations[cap.branch].push(entry);
    } else {
      if (!foundation[cap.level]) {
        foundation[cap.level] = [];
      }
      foundation[cap.level].push(entry);
    }
  }

  // Compute completion percentages
  const foundationLevels = Object.entries(foundation)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([level, capabilities]) => {
      const mastered = capabilities.filter((c: any) => c.mastered).length;
      return {
        level: Number(level),
        name: levelName(Number(level)),
        capabilities,
        completion: capabilities.length > 0 ? Math.round((mastered / capabilities.length) * 100) : 0,
        mastered,
        total: capabilities.length,
      };
    });

  const specializationBranches = Object.entries(BRANCH_INFO).map(
    ([branch, info]) => {
      const capabilities = specializations[branch] ?? [];
      const mastered = capabilities.filter((c: any) => c.mastered).length;
      const enrolled = enrolledBranches.has(branch);
      return {
        branch,
        name: info.name,
        description: info.description,
        enrolled,
        capabilities,
        completion:
          capabilities.length > 0
            ? Math.round((mastered / capabilities.length) * 100)
            : 0,
        mastered,
        total: capabilities.length,
      };
    }
  );

  // Overall stats
  const allCapabilities = masteryStates.length;
  const allMastered = masteryStates.filter((ms) => ms.masteredAt !== null).length;

  return c.json({
    agent: {
      id: agent.id,
      name: agent.name,
      modelClass: agent.modelClass,
      elo: { mu: Math.round(agent.eloMu), sigma: Math.round(agent.eloSigma) },
    },
    overall: {
      totalCapabilities: allCapabilities,
      mastered: allMastered,
      completion:
        allCapabilities > 0
          ? Math.round((allMastered / allCapabilities) * 100)
          : 0,
    },
    foundation: foundationLevels,
    specializations: specializationBranches,
  });
});

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Check if an agent has mastered all Foundation L0-L4 capabilities.
 */
async function checkFoundationComplete(agentId: string): Promise<boolean> {
  const foundationCapabilities = await db.capability.findMany({
    where: {
      branch: null,
      level: { lte: FOUNDATION_PREREQUISITE_MAX_LEVEL },
    },
  });

  if (foundationCapabilities.length === 0) return false;

  const masteryStates = await db.agentMasteryState.findMany({
    where: {
      agentId,
      capabilityId: { in: foundationCapabilities.map((c) => c.id) },
    },
  });

  // Every L0-L4 capability must have a mastery state and be mastered
  return (
    masteryStates.length >= foundationCapabilities.length &&
    masteryStates.every((ms) => ms.pMastery >= MASTERY_THRESHOLD)
  );
}

/**
 * Get unmastered Foundation L0-L4 capabilities for an agent.
 */
async function getUnmasteredFoundation(
  agentId: string
): Promise<Array<{ slug: string; name: string; level: number; pMastery: number }>> {
  const foundationCaps = await db.capability.findMany({
    where: {
      branch: null,
      level: { lte: FOUNDATION_PREREQUISITE_MAX_LEVEL },
    },
    orderBy: { level: "asc" },
  });

  const results: Array<{ slug: string; name: string; level: number; pMastery: number }> = [];

  for (const cap of foundationCaps) {
    const mastery = await db.agentMasteryState.findUnique({
      where: { agentId_capabilityId: { agentId, capabilityId: cap.id } },
    });

    if (!mastery || mastery.pMastery < MASTERY_THRESHOLD) {
      results.push({
        slug: cap.slug,
        name: cap.name,
        level: cap.level,
        pMastery: mastery?.pMastery ?? 0,
      });
    }
  }

  return results;
}

function levelName(level: number): string {
  switch (level) {
    case 0: return "Orientation";
    case 1: return "Single Tool Mastery";
    case 2: return "Composition";
    case 3: return "Planning";
    case 4: return "Human Collaboration";
    case 5: return "Meta-Skills";
    default: return `Level ${level}`;
  }
}
