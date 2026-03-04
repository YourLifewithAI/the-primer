/**
 * Error Memory System — Reflexion + MNL Pattern (v2)
 *
 * After each failed task attempt, the agent generates a verbal lesson.
 * The system stores these reflections, detects patterns across capabilities,
 * clusters them into abstract error patterns, and promotes recurring ones
 * to hard constraints.
 *
 * v1: Reflexion pattern — verbal self-reflection per failure
 * v2 (this): MNL pattern — cross-capability clustering, auto-promotion,
 *   pattern statistics for meta-skill training
 * v3 (future): AgentDebug pattern — root cause taxonomy tagging
 *
 * Based on:
 * - Reflexion (Shinn 2023) — verbal reinforcement learning
 * - failure-memory skill — R/C/D counter tracking
 * - Mistake Notebook Learning — batch-clustered abstraction
 */

import { db } from "./db.js";

// ─── Types ───────────────────────────────────────────────────

export interface ReflectionInput {
  agentId: string;
  taskAttemptId?: string;
  capabilitySlug: string;
  content: string;          // The agent's verbal lesson (100-200 tokens)
  errorType?: ErrorTypeTag;
}

export type ErrorTypeTag =
  | "TOOL_SELECTION"
  | "ARGUMENT_ERROR"
  | "INTERPRETATION"
  | "PLANNING"
  | "COLLABORATION"
  | "MEMORY"
  | "SYSTEM"
  | "UNKNOWN";

export interface RelevantReflection {
  content: string;
  recurrence: number;
  isConstraint: boolean;
}

// ─── Core Functions ──────────────────────────────────────────

/**
 * Store a new reflection after a failed task attempt.
 *
 * Checks for similarity with existing reflections:
 * - If similar reflection exists (>= threshold), increment recurrence
 * - If new pattern, create a fresh reflection
 */
export async function storeReflection(input: ReflectionInput): Promise<void> {
  // Check for similar existing reflections
  const existing = await db.reflection.findMany({
    where: {
      agentId: input.agentId,
      capabilitySlug: input.capabilitySlug,
    },
    orderBy: { recurrence: "desc" },
  });

  // Simple similarity check: look for substantial keyword overlap
  const similar = existing.find((r) => isSimilar(r.content, input.content));

  if (similar) {
    const newRecurrence = similar.recurrence + 1;
    // v2: Auto-promote at recurrence >= 5 (no confirmations needed — if
    // you've seen the same failure 5 times, it's a real pattern).
    // Original threshold: recurrence >= 3 && confirmations >= 2.
    const shouldPromote =
      (newRecurrence >= 5) ||
      (newRecurrence >= 3 && similar.confirmations >= 2);

    await db.reflection.update({
      where: { id: similar.id },
      data: {
        recurrence: { increment: 1 },
        content: input.content.length > similar.content.length
          ? input.content
          : similar.content,
        errorType: input.errorType ?? similar.errorType,
        promotedToConstraint: shouldPromote,
      },
    });
  } else {
    // v2: Before creating a new reflection, check for cross-capability
    // patterns — same error type across different capabilities is a
    // stronger signal than capability-specific failures.
    const crossCapMatch = existing.length === 0
      ? await db.reflection.findFirst({
          where: {
            agentId: input.agentId,
            errorType: input.errorType ?? "UNKNOWN",
            NOT: { capabilitySlug: input.capabilitySlug },
          },
          orderBy: { recurrence: "desc" },
        })
      : null;

    if (crossCapMatch && isSimilar(crossCapMatch.content, input.content, 0.35)) {
      // Cross-capability pattern detected — increment the existing one
      // and tag it as cross-cutting
      const newRecurrence = crossCapMatch.recurrence + 1;
      await db.reflection.update({
        where: { id: crossCapMatch.id },
        data: {
          recurrence: { increment: 1 },
          capabilitySlug: "_cross_capability",
          promotedToConstraint: newRecurrence >= 4, // Lower threshold for cross-cap
        },
      });
    } else {
      // Genuinely new pattern
      await db.reflection.create({
        data: {
          agentId: input.agentId,
          taskAttemptId: input.taskAttemptId,
          capabilitySlug: input.capabilitySlug,
          content: input.content,
          errorType: input.errorType ?? "UNKNOWN",
          recurrence: 1,
          confirmations: 0,
          disconfirmations: 0,
        },
      });
    }
  }
}

/**
 * Retrieve relevant reflections for an upcoming task.
 *
 * Returns reflections from the same capability area,
 * ordered by relevance (promoted constraints first, then recurrence).
 *
 * @param agentId - The agent to retrieve reflections for
 * @param capabilitySlug - The capability being tested
 * @param limit - Max reflections to return (default: 5)
 */
export async function getRelevantReflections(
  agentId: string,
  capabilitySlug: string,
  limit: number = 5
): Promise<RelevantReflection[]> {
  // v2: Pull both capability-specific and cross-capability reflections
  const reflections = await db.reflection.findMany({
    where: {
      agentId,
      OR: [
        { capabilitySlug },
        { capabilitySlug: "_cross_capability", promotedToConstraint: true },
      ],
    },
    orderBy: [
      { promotedToConstraint: "desc" },
      { recurrence: "desc" },
      { updatedAt: "desc" },
    ],
    take: limit,
  });

  return reflections.map((r) => ({
    content: r.content,
    recurrence: r.recurrence,
    isConstraint: r.promotedToConstraint,
  }));
}

/**
 * Confirm a reflection (the lesson was validated as correct).
 * Used when the agent succeeds after applying a lesson.
 */
export async function confirmReflection(reflectionId: string): Promise<void> {
  const reflection = await db.reflection.findUnique({
    where: { id: reflectionId },
  });
  if (!reflection) return;

  await db.reflection.update({
    where: { id: reflectionId },
    data: {
      confirmations: { increment: 1 },
      // Auto-promote if thresholds met
      promotedToConstraint:
        reflection.recurrence >= 3 && (reflection.confirmations + 1) >= 2,
    },
  });
}

/**
 * Disconfirm a reflection (the lesson was wrong or unhelpful).
 */
export async function disconfirmReflection(reflectionId: string): Promise<void> {
  await db.reflection.update({
    where: { id: reflectionId },
    data: {
      disconfirmations: { increment: 1 },
    },
  });
}

/**
 * Format reflections as context for the agent.
 *
 * Returns a string that can be prepended to the task prompt,
 * giving the agent its own past lessons.
 */
export function formatReflectionsAsContext(reflections: RelevantReflection[]): string {
  if (reflections.length === 0) return "";

  const lines = reflections.map((r) => {
    const prefix = r.isConstraint ? "[CONSTRAINT]" : `[lesson, seen ${r.recurrence}x]`;
    return `${prefix} ${r.content}`;
  });

  return [
    "--- Your past lessons for this capability ---",
    ...lines,
    "--- End lessons ---",
    "",
  ].join("\n");
}

// ─── v2: Pattern Clustering ──────────────────────────────────

export interface ErrorPattern {
  errorType: string;
  count: number;
  capabilities: string[];
  topReflection: string;
  isConstraint: boolean;
}

/**
 * Cluster an agent's reflections into abstract error patterns.
 *
 * Groups by errorType, counts occurrences, lists affected capabilities.
 * Used by L5 meta-skill tasks to help agents recognize their own patterns.
 */
export async function clusterReflections(
  agentId: string,
): Promise<ErrorPattern[]> {
  const reflections = await db.reflection.findMany({
    where: { agentId },
    orderBy: { recurrence: "desc" },
  });

  // Group by errorType
  const clusters = new Map<string, typeof reflections>();
  for (const r of reflections) {
    const key = r.errorType ?? "UNKNOWN";
    const group = clusters.get(key) ?? [];
    group.push(r);
    clusters.set(key, group);
  }

  return Array.from(clusters.entries())
    .map(([errorType, group]) => ({
      errorType,
      count: group.reduce((sum, r) => sum + r.recurrence, 0),
      capabilities: [...new Set(group.map((r) => r.capabilitySlug))],
      topReflection: group[0].content,
      isConstraint: group.some((r) => r.promotedToConstraint),
    }))
    .sort((a, b) => b.count - a.count);
}

// ─── Similarity Detection ────────────────────────────────────

/**
 * Simple keyword-overlap similarity check.
 *
 * In v2 (MNL pattern), this would use embeddings for semantic similarity.
 * For v1, keyword overlap >= 0.5 is "similar enough."
 */
function isSimilar(a: string, b: string, threshold = 0.5): boolean {
  const wordsA = extractKeywords(a);
  const wordsB = extractKeywords(b);

  if (wordsA.size === 0 || wordsB.size === 0) return false;

  let overlap = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) overlap++;
  }

  const similarity = overlap / Math.max(wordsA.size, wordsB.size);
  return similarity >= threshold;
}

function extractKeywords(text: string): Set<string> {
  const stopWords = new Set([
    "the", "a", "an", "is", "was", "are", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "to", "of", "in", "for",
    "on", "with", "at", "by", "from", "as", "into", "through", "during",
    "before", "after", "above", "below", "between", "and", "but", "or",
    "not", "no", "nor", "so", "yet", "both", "either", "neither", "each",
    "every", "all", "any", "few", "more", "most", "other", "some", "such",
    "than", "too", "very", "just", "also", "i", "it", "its", "this", "that",
  ]);

  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w))
  );
}
