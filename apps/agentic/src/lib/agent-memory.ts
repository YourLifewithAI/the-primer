/**
 * Agent Memory Service — Mem0 integration layer.
 *
 * Sprint 3A: Persistent agent memory that stores and retrieves
 * learning experiences across sessions.
 *
 * This complements the existing Reflexion-based error-memory system
 * (error-memory.ts) with a semantic memory layer. The key difference:
 * - error-memory.ts: structured lesson storage (per-capability, keyword matching)
 * - agent-memory.ts: semantic memory (vector search, cross-capability patterns)
 *
 * Stores:
 * - Task attempts (what worked, what didn't)
 * - Strategy discoveries (approaches that generalize across tasks)
 * - Error patterns (failure modes the agent has encountered)
 * - Reflections (agent's own analysis of its performance)
 *
 * Uses Neon pgvector for the vector store (reuses existing DB).
 */

import { MemoryClient } from "mem0ai";

// ─── Types ───────────────────────────────────────────────────

export interface MemoryEntry {
  content: string;
  metadata: MemoryMetadata;
}

export interface MemoryMetadata {
  type: MemoryType;
  agentId: string;
  taskId?: string;
  capabilitySlug?: string;
  score?: number;
  timestamp: string;
}

export type MemoryType =
  | "task_attempt"
  | "strategy_discovery"
  | "error_pattern"
  | "reflection"
  | "milestone";

export interface MemorySearchResult {
  id: string;
  content: string;
  metadata: MemoryMetadata;
  score: number;
}

export interface StoreTaskMemoryInput {
  agentId: string;
  taskId: string;
  capabilitySlug: string;
  prompt: string;
  correct: boolean;
  score: number;
  approach?: string;
  reflection?: string;
}

export interface StoreStrategyInput {
  agentId: string;
  capabilitySlug: string;
  strategy: string;
  context: string;
  effectiveness: number;
}

// ─── Memory Client ───────────────────────────────────────────

let memoryClient: MemoryClient | null = null;

/**
 * Get or create the Mem0 client.
 *
 * Uses MEM0_API_KEY from environment. If not set, returns null
 * and all memory operations gracefully degrade to no-ops.
 */
function getClient(): MemoryClient | null {
  if (memoryClient) return memoryClient;

  const apiKey = process.env.MEM0_API_KEY;
  if (!apiKey) {
    console.warn("[agent-memory] MEM0_API_KEY not set — memory operations will be no-ops");
    return null;
  }

  memoryClient = new MemoryClient({ apiKey });
  return memoryClient;
}

// ─── Core Operations ─────────────────────────────────────────

/**
 * Store a memory of a task attempt.
 *
 * Creates a natural-language summary of the attempt that can be
 * retrieved semantically when the agent faces similar tasks later.
 */
export async function storeTaskMemory(input: StoreTaskMemoryInput): Promise<void> {
  const client = getClient();
  if (!client) return;

  const outcome = input.correct ? "succeeded" : "failed";
  const content = [
    `Task attempt on ${input.capabilitySlug}: ${outcome} (score: ${input.score.toFixed(2)}).`,
    `Task: ${input.prompt.slice(0, 200)}`,
    input.approach ? `Approach: ${input.approach}` : null,
    input.reflection ? `Lesson: ${input.reflection}` : null,
  ].filter(Boolean).join("\n");

  try {
    await client.add([{ role: "user", content }], {
      user_id: input.agentId,
      metadata: {
        type: "task_attempt" as MemoryType,
        agentId: input.agentId,
        taskId: input.taskId,
        capabilitySlug: input.capabilitySlug,
        score: input.score,
        timestamp: new Date().toISOString(),
      } satisfies MemoryMetadata,
    });
  } catch (err) {
    console.error("[agent-memory] Failed to store task memory:", err);
  }
}

/**
 * Store a strategy discovery.
 *
 * When an agent finds an approach that works well (high score on a
 * difficult task), the strategy is preserved for future retrieval.
 */
export async function storeStrategy(input: StoreStrategyInput): Promise<void> {
  const client = getClient();
  if (!client) return;

  const content = [
    `Strategy for ${input.capabilitySlug}: ${input.strategy}`,
    `Context: ${input.context}`,
    `Effectiveness: ${input.effectiveness.toFixed(2)}`,
  ].join("\n");

  try {
    await client.add([{ role: "user", content }], {
      user_id: input.agentId,
      metadata: {
        type: "strategy_discovery" as MemoryType,
        agentId: input.agentId,
        capabilitySlug: input.capabilitySlug,
        score: input.effectiveness,
        timestamp: new Date().toISOString(),
      } satisfies MemoryMetadata,
    });
  } catch (err) {
    console.error("[agent-memory] Failed to store strategy:", err);
  }
}

/**
 * Store an error pattern.
 *
 * Captures recurring failure modes so the agent can recognize and
 * avoid them in future tasks.
 */
export async function storeErrorPattern(
  agentId: string,
  capabilitySlug: string,
  pattern: string,
  frequency: number
): Promise<void> {
  const client = getClient();
  if (!client) return;

  const content = `Error pattern in ${capabilitySlug} (seen ${frequency}x): ${pattern}`;

  try {
    await client.add([{ role: "user", content }], {
      user_id: agentId,
      metadata: {
        type: "error_pattern" as MemoryType,
        agentId,
        capabilitySlug,
        timestamp: new Date().toISOString(),
      } satisfies MemoryMetadata,
    });
  } catch (err) {
    console.error("[agent-memory] Failed to store error pattern:", err);
  }
}

// ─── Retrieval ───────────────────────────────────────────────

/**
 * Retrieve relevant memories for an upcoming task.
 *
 * Uses semantic search to find memories related to the task prompt.
 * This gives the agent context-aware difficulty: if it has struggled
 * with similar tasks before, those experiences inform the new attempt.
 *
 * @param agentId - The agent whose memories to search
 * @param query - The task prompt or capability description
 * @param limit - Max memories to return (default: 5)
 */
export async function retrieveMemories(
  agentId: string,
  query: string,
  limit: number = 5
): Promise<MemorySearchResult[]> {
  const client = getClient();
  if (!client) return [];

  try {
    const results = await client.search(query, {
      user_id: agentId,
      limit,
    });

    return (results as any[]).map((r: any) => ({
      id: r.id ?? "",
      content: r.memory ?? r.content ?? "",
      metadata: (r.metadata ?? {}) as MemoryMetadata,
      score: r.score ?? 0,
    }));
  } catch (err) {
    console.error("[agent-memory] Failed to retrieve memories:", err);
    return [];
  }
}

/**
 * Get all memories for an agent.
 *
 * Unlike retrieveMemories (semantic search), this returns everything.
 * Used for the /agents/:id/memories API endpoint.
 */
export async function getAllMemories(
  agentId: string,
  limit: number = 50
): Promise<MemorySearchResult[]> {
  const client = getClient();
  if (!client) return [];

  try {
    const results = await client.getAll({
      user_id: agentId,
      limit,
    });

    return (results as any[]).map((r: any) => ({
      id: r.id ?? "",
      content: r.memory ?? r.content ?? "",
      metadata: (r.metadata ?? {}) as MemoryMetadata,
      score: 1.0, // No relevance score for getAll
    }));
  } catch (err) {
    console.error("[agent-memory] Failed to get all memories:", err);
    return [];
  }
}

/**
 * Format retrieved memories as context for an agent's task prompt.
 *
 * Similar to formatReflectionsAsContext in error-memory.ts, but
 * uses semantic retrieval rather than structured lookup.
 */
export function formatMemoriesAsContext(memories: MemorySearchResult[]): string {
  if (memories.length === 0) return "";

  const lines = memories.map((m) => {
    const type = m.metadata?.type ?? "memory";
    return `[${type}] ${m.content}`;
  });

  return [
    "--- Relevant past experience ---",
    ...lines,
    "--- End experience ---",
    "",
  ].join("\n");
}
