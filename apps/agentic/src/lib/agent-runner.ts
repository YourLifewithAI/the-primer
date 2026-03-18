/**
 * Agent Runner — Persistent agent execution loop.
 *
 * Sprint 3A: Orchestrates the full cycle:
 *   task assignment → execution → evaluation → memory update
 *
 * Architecture:
 * - BullMQ job queue for durable task processing
 * - Per-task token budgets and tool call limits
 * - Three run modes: single-task, continuous, batch
 * - Integration with Mastra runtime, Mem0 memory, and E2B sandbox
 *
 * Key research finding: unbounded autonomy is the #1 failure mode.
 * Every run has explicit budgets on tokens, tool calls, and wall-clock time.
 */

import { Queue, Worker, type Job } from "bullmq";
import type { RuntimeConfig, TaskExecutionResult } from "./agent-runtime.js";
import { executeTask, DEFAULT_RUNTIME_CONFIG } from "./agent-runtime.js";
import { storeTaskMemory, storeStrategy, retrieveMemories, formatMemoriesAsContext } from "./agent-memory.js";
import { evaluate, type EvaluationResult, type Rubric } from "./evaluate.js";
import { db } from "./db.js";
import { storeReflection } from "./error-memory.js";
import { eloUpdate } from "./elo.js";
import { bktUpdate, type BKTParams } from "./bkt-bridge.js";

// ─── Types ───────────────────────────────────────────────────

export type RunMode = "single" | "continuous" | "batch";

export type RunStatus =
  | "queued"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "stopped";

export interface RunConfig {
  mode: RunMode;
  /** Runtime constraints per task */
  runtimeConfig: RuntimeConfig;
  /** For batch mode: how many tasks to run */
  batchSize?: number;
  /** For continuous mode: delay between tasks in ms */
  pauseBetweenMs?: number;
  /** Optional: target a specific capability */
  capabilitySlug?: string;
  /** Optional: target a specific course */
  courseSlug?: string;
}

export interface RunState {
  runId: string;
  agentId: string;
  status: RunStatus;
  mode: RunMode;
  tasksCompleted: number;
  tasksSucceeded: number;
  tasksFailed: number;
  totalTokens: number;
  startedAt: Date;
  completedAt?: Date;
  currentTaskId?: string;
  error?: string;
  results: TaskRunResult[];
}

export interface TaskRunResult {
  taskId: string;
  capabilitySlug: string;
  score: number;
  correct: boolean;
  tokenCount: number;
  toolCallCount: number;
  durationMs: number;
  status: TaskExecutionResult["status"];
}

export interface AgentRunJobData {
  runId: string;
  agentId: string;
  config: RunConfig;
}

// ─── Redis Connection ────────────────────────────────────────

function getRedisConnection() {
  const url = process.env.REDIS_URL;
  if (url) {
    return { url };
  }
  return {
    host: process.env.REDIS_HOST ?? "localhost",
    port: Number(process.env.REDIS_PORT ?? 6379),
  };
}

// ─── Queue Setup ─────────────────────────────────────────────

const QUEUE_NAME = "agent-runs";

let runQueue: Queue | null = null;

/**
 * Get or create the BullMQ queue for agent runs.
 * Lazy initialization to avoid connection errors when Redis isn't available.
 */
export function getRunQueue(): Queue {
  if (!runQueue) {
    runQueue = new Queue(QUEUE_NAME, {
      connection: getRedisConnection() as any,
      defaultJobOptions: {
        attempts: 1, // Agent runs should not auto-retry (stateful)
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      },
    });
  }
  return runQueue;
}

// ─── In-Memory Run State ─────────────────────────────────────
// Run state is tracked in memory for active runs, persisted to DB on completion.
// BullMQ handles durability for the job itself.

const activeRuns = new Map<string, RunState>();

/** Max completed runs to retain in memory before eviction */
const MAX_COMPLETED_RUNS = 200;

export function getRunState(runId: string): RunState | undefined {
  return activeRuns.get(runId);
}

export function getAgentRuns(agentId: string): RunState[] {
  return Array.from(activeRuns.values()).filter((r) => r.agentId === agentId);
}

/**
 * Evict old completed/failed/stopped runs from memory.
 * Keeps the most recent MAX_COMPLETED_RUNS terminal runs.
 */
function evictStaleRuns(): void {
  const terminal: Array<[string, RunState]> = [];
  for (const entry of activeRuns.entries()) {
    const status = entry[1].status;
    if (status === "completed" || status === "failed" || status === "stopped") {
      terminal.push(entry);
    }
  }
  if (terminal.length <= MAX_COMPLETED_RUNS) return;

  // Sort oldest first, evict excess
  terminal.sort((a, b) => (a[1].completedAt?.getTime() ?? 0) - (b[1].completedAt?.getTime() ?? 0));
  const toEvict = terminal.length - MAX_COMPLETED_RUNS;
  for (let i = 0; i < toEvict; i++) {
    activeRuns.delete(terminal[i][0]);
  }
}

// ─── Run Lifecycle ───────────────────────────────────────────

/**
 * Start an agent run.
 *
 * Enqueues a job in BullMQ that will:
 * 1. Fetch the next task for the agent
 * 2. Execute it via Mastra runtime
 * 3. Evaluate the result
 * 4. Update BKT/Elo/memory
 * 5. Repeat (for continuous/batch modes) or complete
 */
export async function startRun(
  agentId: string,
  config: Partial<RunConfig> = {}
): Promise<RunState> {
  const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const fullConfig: RunConfig = {
    mode: config.mode ?? "single",
    runtimeConfig: { ...DEFAULT_RUNTIME_CONFIG, ...config.runtimeConfig },
    batchSize: config.batchSize ?? 1,
    pauseBetweenMs: config.pauseBetweenMs ?? 2000,
    capabilitySlug: config.capabilitySlug,
    courseSlug: config.courseSlug,
  };

  const state: RunState = {
    runId,
    agentId,
    status: "queued",
    mode: fullConfig.mode,
    tasksCompleted: 0,
    tasksSucceeded: 0,
    tasksFailed: 0,
    totalTokens: 0,
    startedAt: new Date(),
    results: [],
  };

  activeRuns.set(runId, state);

  // Enqueue the job
  const queue = getRunQueue();
  await queue.add("agent-run", {
    runId,
    agentId,
    config: fullConfig,
  } satisfies AgentRunJobData);

  return state;
}

/**
 * Stop a running agent.
 *
 * Sets the run status to "stopped" — the worker checks this
 * flag between tasks and halts gracefully.
 */
export function stopRun(runId: string): boolean {
  const state = activeRuns.get(runId);
  if (!state || state.status === "completed" || state.status === "failed") {
    return false;
  }
  state.status = "stopped";
  state.completedAt = new Date();
  return true;
}

/**
 * Stop all active runs for an agent.
 */
export function stopAgentRuns(agentId: string): number {
  let stopped = 0;
  for (const state of activeRuns.values()) {
    if (state.agentId === agentId && state.status === "running") {
      state.status = "stopped";
      state.completedAt = new Date();
      stopped++;
    }
  }
  return stopped;
}

// ─── Worker ──────────────────────────────────────────────────

let worker: Worker | null = null;

/**
 * Start the BullMQ worker that processes agent runs.
 *
 * Call this once at application startup. The worker picks up
 * queued jobs and executes the task loop.
 */
export function startWorker(): Worker {
  if (worker) return worker;

  worker = new Worker(
    QUEUE_NAME,
    async (job: Job<AgentRunJobData>) => {
      const { runId, agentId, config } = job.data;
      const state = activeRuns.get(runId);

      if (!state) {
        throw new Error(`Run state not found for ${runId}`);
      }

      state.status = "running";

      try {
        const maxTasks = config.mode === "single"
          ? 1
          : config.mode === "batch"
            ? (config.batchSize ?? 5)
            : Infinity; // continuous: runs until stopped

        for (let i = 0; i < maxTasks; i++) {
          // Check if stopped (status may be mutated externally by stopRun)
          if ((state.status as RunStatus) === "stopped") break;

          // Execute one task cycle
          const result = await executeOneTask(agentId, config);

          if (!result) {
            // No tasks available
            state.status = "completed";
            state.completedAt = new Date();
            break;
          }

          // Update state
          state.tasksCompleted++;
          state.totalTokens += result.tokenCount;
          state.currentTaskId = result.taskId;
          state.results.push(result);

          if (result.correct) {
            state.tasksSucceeded++;
          } else {
            state.tasksFailed++;
          }

          // Pause between tasks in continuous mode
          if (config.mode === "continuous" && i < maxTasks - 1 && (state.status as RunStatus) !== "stopped") {
            state.status = "paused";
            await sleep(config.pauseBetweenMs ?? 2000);
            if ((state.status as RunStatus) === "stopped") break;
            state.status = "running";
          }
        }

        if ((state.status as RunStatus) !== "stopped") {
          state.status = "completed";
          state.completedAt = new Date();
        }

        evictStaleRuns();
      } catch (err: any) {
        state.status = "failed";
        state.error = err.message;
        state.completedAt = new Date();
        evictStaleRuns();
        throw err;
      }
    },
    {
      connection: getRedisConnection() as any,
      concurrency: 5, // Max 5 simultaneous agent runs
    }
  );

  worker.on("failed", (job, err) => {
    console.error(`[agent-runner] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}

// ─── Core Task Cycle ─────────────────────────────────────────

/**
 * Execute one complete task cycle:
 * 1. Get next task from adaptive selection
 * 2. Retrieve relevant memories
 * 3. Execute via Mastra runtime
 * 4. Evaluate result
 * 5. Update BKT/Elo
 * 6. Store memory
 *
 * Returns null if no tasks are available.
 */
async function executeOneTask(
  agentId: string,
  config: RunConfig
): Promise<TaskRunResult | null> {
  // 1. Find the agent
  const agent = await db.agent.findUnique({ where: { id: agentId } });
  if (!agent) throw new Error(`Agent ${agentId} not found`);

  // 2. Find next task (simplified adaptive selection)
  const enrollments = await db.enrollment.findMany({
    where: {
      agentId,
      ...(config.courseSlug ? { course: { slug: config.courseSlug } } : {}),
    },
    include: { course: true },
  });

  if (enrollments.length === 0) return null;

  const courseIds = enrollments.map((e) => e.courseId);

  // Get capabilities with prerequisites
  const capabilities = await db.capability.findMany({
    where: {
      courseId: { in: courseIds },
      ...(config.capabilitySlug ? { slug: config.capabilitySlug } : {}),
    },
    include: { prerequisites: true },
    orderBy: { level: "asc" },
  });

  const masteryStates = await db.agentMasteryState.findMany({
    where: { agentId },
  });
  const masteryMap = new Map(masteryStates.map((ms) => [ms.capabilityId, ms]));

  // Find unmastered capability with satisfied prerequisites
  let targetCap = null;
  for (const cap of capabilities) {
    const mastery = masteryMap.get(cap.id);
    if (mastery?.masteredAt) continue;

    const prereqsMet = cap.prerequisites.every((prereq) => {
      const m = masteryMap.get(prereq.prerequisiteId);
      return m?.masteredAt != null;
    });

    if (prereqsMet) {
      targetCap = cap;
      break;
    }
  }

  if (!targetCap) return null;

  // 3. Get a task for this capability
  const task = await db.task.findFirst({
    where: { capabilityId: targetCap.id },
    include: { capability: true },
    orderBy: { createdAt: "desc" },
  });

  if (!task) return null;

  // 4. Retrieve relevant memories
  const memories = await retrieveMemories(agentId, task.prompt, 3);
  const memoryContext = formatMemoriesAsContext(memories);
  const fullPrompt = memoryContext ? `${memoryContext}\n${task.prompt}` : task.prompt;

  // 5. Execute via Mastra runtime
  const execResult = await executeTask({
    agentId,
    taskId: task.id,
    prompt: fullPrompt,
    config: config.runtimeConfig,
  });

  // 6. Evaluate
  const evalResult = evaluate(
    execResult.response ?? { text: "", toolCalls: [] },
    task.rubric as unknown as Rubric
  );

  // 7. Update BKT
  let masteryState = masteryMap.get(targetCap.id);
  if (!masteryState) {
    masteryState = await db.agentMasteryState.create({
      data: {
        agentId,
        capabilityId: targetCap.id,
        pMastery: 0.1,
        pInit: 0.1,
        pTransit: 0.2,
        pSlip: 0.1,
        pGuess: 0.05,
      },
    });
  }

  const bktParams: BKTParams = {
    pMastery: masteryState.pMastery,
    pInit: masteryState.pInit,
    pTransit: masteryState.pTransit,
    pSlip: masteryState.pSlip,
    pGuess: masteryState.pGuess,
  };
  const bktResult = bktUpdate(bktParams, evalResult.correct);

  // 8. Update Elo
  const agentElo = { mu: masteryState.eloMu, sigma: masteryState.eloSigma };
  const taskElo = { mu: task.eloMu, sigma: task.eloSigma };
  const eloResult = eloUpdate(agentElo, taskElo, evalResult.score);

  // 9. Persist task attempt
  const attempt = await db.taskAttempt.create({
    data: {
      agentId,
      taskId: task.id,
      response: (execResult.response ?? {}) as any,
      score: evalResult.score,
      correct: evalResult.correct,
      pMasteryBefore: masteryState.pMastery,
      pMasteryAfter: bktResult.pMastery,
      eloMuBefore: masteryState.eloMu,
      eloMuAfter: eloResult.agent.mu,
      criteriaScores: evalResult.criteriaScores,
      evaluationNotes: evalResult.notes,
      tokenCount: execResult.tokenCount,
      toolCallCount: execResult.toolCallCount,
    },
  });

  // 10. Update mastery state
  await db.agentMasteryState.update({
    where: {
      agentId_capabilityId: {
        agentId,
        capabilityId: targetCap.id,
      },
    },
    data: {
      pMastery: bktResult.pMastery,
      eloMu: eloResult.agent.mu,
      eloSigma: eloResult.agent.sigma,
      totalAttempts: { increment: 1 },
      correctCount: evalResult.correct ? { increment: 1 } : undefined,
      masteredAt: bktResult.isMastered && !bktResult.wasMastered ? new Date() : undefined,
      lastAttemptAt: new Date(),
    },
  });

  // 11. Update task Elo
  await db.task.update({
    where: { id: task.id },
    data: {
      eloMu: eloResult.task.mu,
      eloSigma: eloResult.task.sigma,
    },
  });

  // 12. Store memory
  await storeTaskMemory({
    agentId,
    taskId: task.id,
    capabilitySlug: targetCap.slug,
    prompt: task.prompt,
    correct: evalResult.correct,
    score: evalResult.score,
  });

  // 13. Store reflection on failure
  if (!evalResult.correct) {
    await storeReflection({
      agentId,
      taskAttemptId: attempt.id,
      capabilitySlug: targetCap.slug,
      content: `[Auto] Score ${evalResult.score.toFixed(2)}: ${evalResult.notes}`,
    });
  }

  // 14. Store strategy on high-scoring success
  if (evalResult.correct && evalResult.score >= 0.9) {
    await storeStrategy({
      agentId,
      capabilitySlug: targetCap.slug,
      strategy: `High-scoring approach on ${targetCap.slug} task`,
      context: task.prompt.slice(0, 200),
      effectiveness: evalResult.score,
    });
  }

  return {
    taskId: task.id,
    capabilitySlug: targetCap.slug,
    score: evalResult.score,
    correct: evalResult.correct,
    tokenCount: execResult.tokenCount,
    toolCallCount: execResult.toolCallCount,
    durationMs: execResult.durationMs,
    status: execResult.status,
  };
}

// ─── Utility ─────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Gracefully shut down the worker and queue.
 */
export async function shutdown(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
  }
  if (runQueue) {
    await runQueue.close();
    runQueue = null;
  }
}
