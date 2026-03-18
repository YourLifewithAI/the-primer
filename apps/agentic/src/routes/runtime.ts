/**
 * Runtime routes — Agent execution and memory API.
 *
 * Sprint 3A: Exposes the agent runtime, memory, and run management.
 *
 * Routes:
 *   POST /agents/:id/run    — Start an agent run (single, continuous, or batch)
 *   POST /agents/:id/stop   — Stop a running agent
 *   GET  /agents/:id/memories — View agent's accumulated memories
 *   GET  /agents/:id/runs    — Run history with task results
 */

import { Hono } from "hono";
import { db } from "../lib/db.js";
import {
  startRun,
  stopAgentRuns,
  getAgentRuns,
  getRunState,
  stopRun,
  type RunMode,
} from "../lib/agent-runner.js";
import { getAllMemories, retrieveMemories } from "../lib/agent-memory.js";
import { authMiddleware } from "../middleware/auth.js";
import type { AppEnv } from "../types.js";

export const runtimeRoutes = new Hono<AppEnv>();

// ─── Middleware: validate agent exists ────────────────────────

async function resolveAgent(agentId: string) {
  return db.agent.findUnique({ where: { id: agentId } });
}

// ─── POST /agents/:id/run ────────────────────────────────────

/**
 * Start an agent run.
 *
 * Body: {
 *   mode?: "single" | "continuous" | "batch" (default: "single")
 *   batchSize?: number (for batch mode, default: 5)
 *   pauseBetweenMs?: number (for continuous mode, default: 2000)
 *   capabilitySlug?: string (target specific capability)
 *   courseSlug?: string (target specific course)
 *   tokenBudget?: number (per-task token limit, default: 4096)
 *   toolCallLimit?: number (per-task tool call limit, default: 10)
 *   timeoutMs?: number (per-task timeout, default: 60000)
 * }
 */
runtimeRoutes.post("/:id/run", authMiddleware, async (c) => {
  const agentId = c.req.param("id");
  const agent = await resolveAgent(agentId);

  if (!agent) {
    return c.json({ error: "Agent not found" }, 404);
  }

  const body = await c.req.json().catch(() => ({}));

  const mode = (body.mode ?? "single") as RunMode;
  if (!["single", "continuous", "batch"].includes(mode)) {
    return c.json({ error: "mode must be 'single', 'continuous', or 'batch'" }, 400);
  }

  // Clamp runtime parameters to sane upper bounds
  const MAX_BATCH_SIZE = 100;
  const MAX_TOKEN_BUDGET = 32_768;
  const MAX_TOOL_CALL_LIMIT = 50;
  const MAX_TIMEOUT_MS = 300_000; // 5 minutes

  if (body.batchSize != null && (body.batchSize < 1 || body.batchSize > MAX_BATCH_SIZE)) {
    return c.json({ error: `batchSize must be between 1 and ${MAX_BATCH_SIZE}` }, 400);
  }
  if (body.toolCallLimit != null && (body.toolCallLimit < 1 || body.toolCallLimit > MAX_TOOL_CALL_LIMIT)) {
    return c.json({ error: `toolCallLimit must be between 1 and ${MAX_TOOL_CALL_LIMIT}` }, 400);
  }
  if (body.tokenBudget != null && (body.tokenBudget < 1 || body.tokenBudget > MAX_TOKEN_BUDGET)) {
    return c.json({ error: `tokenBudget must be between 1 and ${MAX_TOKEN_BUDGET}` }, 400);
  }
  if (body.timeoutMs != null && (body.timeoutMs < 1000 || body.timeoutMs > MAX_TIMEOUT_MS)) {
    return c.json({ error: `timeoutMs must be between 1000 and ${MAX_TIMEOUT_MS}` }, 400);
  }

  // Check for already running agents (prevent double-runs)
  const existingRuns = getAgentRuns(agentId).filter(
    (r) => r.status === "running" || r.status === "queued"
  );
  if (existingRuns.length > 0) {
    return c.json({
      error: "Agent already has an active run",
      activeRunId: existingRuns[0].runId,
      hint: "POST /agents/:id/stop to stop it first",
    }, 409);
  }

  try {
    const state = await startRun(agentId, {
      mode,
      batchSize: body.batchSize,
      pauseBetweenMs: body.pauseBetweenMs,
      capabilitySlug: body.capabilitySlug,
      courseSlug: body.courseSlug,
      runtimeConfig: {
        tokenBudget: body.tokenBudget ?? 4096,
        toolCallLimit: body.toolCallLimit ?? 10,
        timeoutMs: body.timeoutMs ?? 60_000,
      },
    });

    return c.json({
      runId: state.runId,
      agentId: state.agentId,
      mode: state.mode,
      status: state.status,
      startedAt: state.startedAt.toISOString(),
      message: `Agent run started in ${mode} mode`,
    }, 201);
  } catch (err: any) {
    return c.json({
      error: "Failed to start run",
      details: err.message,
    }, 500);
  }
});

// ─── POST /agents/:id/stop ───────────────────────────────────

/**
 * Stop all active runs for an agent.
 *
 * Body: { runId?: string } — optional, stop a specific run
 */
runtimeRoutes.post("/:id/stop", authMiddleware, async (c) => {
  const agentId = c.req.param("id");
  const agent = await resolveAgent(agentId);

  if (!agent) {
    return c.json({ error: "Agent not found" }, 404);
  }

  const body = await c.req.json().catch(() => ({}));

  if (body.runId) {
    const stopped = stopRun(body.runId);
    if (!stopped) {
      return c.json({ error: "Run not found or already completed" }, 404);
    }
    return c.json({ message: "Run stopped", runId: body.runId });
  }

  const stoppedCount = stopAgentRuns(agentId);

  if (stoppedCount === 0) {
    return c.json({ message: "No active runs to stop" });
  }

  return c.json({
    message: `Stopped ${stoppedCount} active run(s)`,
    stoppedCount,
  });
});

// ─── GET /agents/:id/memories ────────────────────────────────

/**
 * Get agent's accumulated memories.
 *
 * Query params:
 *   query?: string — semantic search (returns most relevant)
 *   limit?: number — max memories to return (default: 50)
 */
runtimeRoutes.get("/:id/memories", authMiddleware, async (c) => {
  const agentId = c.req.param("id");
  const agent = await resolveAgent(agentId);

  if (!agent) {
    return c.json({ error: "Agent not found" }, 404);
  }

  const query = c.req.query("query");
  const limit = Number(c.req.query("limit") ?? 50);

  let memories;
  if (query) {
    memories = await retrieveMemories(agentId, query, limit);
  } else {
    memories = await getAllMemories(agentId, limit);
  }

  return c.json({
    agentId,
    agentName: agent.name,
    memoryCount: memories.length,
    memories: memories.map((m) => ({
      id: m.id,
      content: m.content,
      type: m.metadata?.type ?? "unknown",
      capabilitySlug: m.metadata?.capabilitySlug,
      score: m.score,
      timestamp: m.metadata?.timestamp,
    })),
  });
});

// ─── GET /agents/:id/runs ────────────────────────────────────

/**
 * Get run history for an agent.
 *
 * Returns all tracked runs (active and completed) with task results.
 */
runtimeRoutes.get("/:id/runs", authMiddleware, async (c) => {
  const agentId = c.req.param("id");
  const agent = await resolveAgent(agentId);

  if (!agent) {
    return c.json({ error: "Agent not found" }, 404);
  }

  const runs = getAgentRuns(agentId);

  return c.json({
    agentId,
    agentName: agent.name,
    runCount: runs.length,
    runs: runs.map((r) => ({
      runId: r.runId,
      mode: r.mode,
      status: r.status,
      tasksCompleted: r.tasksCompleted,
      tasksSucceeded: r.tasksSucceeded,
      tasksFailed: r.tasksFailed,
      totalTokens: r.totalTokens,
      accuracy: r.tasksCompleted > 0
        ? Math.round((r.tasksSucceeded / r.tasksCompleted) * 100)
        : null,
      startedAt: r.startedAt.toISOString(),
      completedAt: r.completedAt?.toISOString() ?? null,
      error: r.error ?? null,
      results: r.results.map((tr) => ({
        taskId: tr.taskId,
        capabilitySlug: tr.capabilitySlug,
        score: Math.round(tr.score * 1000) / 1000,
        correct: tr.correct,
        tokenCount: tr.tokenCount,
        toolCallCount: tr.toolCallCount,
        durationMs: tr.durationMs,
        status: tr.status,
      })),
    })),
  });
});
