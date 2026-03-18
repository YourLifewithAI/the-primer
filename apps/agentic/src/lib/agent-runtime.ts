/**
 * Agent Runtime — Mastra integration layer.
 *
 * Sprint 3A: Wraps Mastra's agent framework to define Primer
 * agent capabilities: tool use, composition, planning, evaluation.
 *
 * Key design decisions:
 * - Mastra is the orchestration layer, not the curriculum layer.
 *   The Primer's existing BKT/Elo/rubric system handles learning progression.
 *   Mastra handles agent execution: tool dispatch, workflow graphs, suspend/resume.
 * - Suspend/resume enables human-in-the-loop curriculum approval gates.
 * - Per-task token budgets enforced at the runtime level (research finding:
 *   unbounded autonomy is the #1 production failure mode).
 */

import { Agent } from "@mastra/core/agent";
import { createTool, type Tool } from "@mastra/core/tools";
import { z } from "zod";

// ─── Types ───────────────────────────────────────────────────

export interface AgentCapability {
  name: string;
  slug: string;
  description: string;
  tools: Tool[];
}

export interface RuntimeConfig {
  /** Max tokens the agent can consume per task */
  tokenBudget: number;
  /** Max tool calls per task */
  toolCallLimit: number;
  /** Timeout in ms for the entire task execution */
  timeoutMs: number;
  /** Model ID to use for the agent (e.g., "openai/gpt-4o-mini") */
  modelId?: string;
}

export interface TaskExecutionContext {
  agentId: string;
  taskId: string;
  prompt: string;
  config: RuntimeConfig;
  /** If true, execution pauses after planning for human approval */
  requireApproval?: boolean;
}

export interface TaskExecutionResult {
  status: "completed" | "suspended" | "failed" | "timeout" | "budget_exceeded";
  response?: {
    text?: string;
    toolCalls?: Array<{
      tool: string;
      arguments?: Record<string, unknown>;
      result?: unknown;
    }>;
  };
  tokenCount: number;
  toolCallCount: number;
  durationMs: number;
  error?: string;
  /** Set when status is "suspended" — used to resume later */
  suspendPayload?: Record<string, unknown>;
}

// ─── Default Budgets ─────────────────────────────────────────

export const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  tokenBudget: 4096,
  toolCallLimit: 10,
  timeoutMs: 60_000,
};

// ─── Primer Tools ────────────────────────────────────────────
// These map the Primer's existing capabilities to Mastra tool definitions.
// Agents being tested use these tools; the Primer evaluates their usage.

export const readFileTool = createTool({
  id: "read_file",
  description: "Read the contents of a file at the given path.",
  inputSchema: z.object({
    path: z.string().describe("File path to read"),
  }),
  outputSchema: z.object({
    content: z.string(),
    error: z.string().optional(),
  }),
  execute: async (_input) => {
    // In sandbox mode, this delegates to E2B. In test mode, returns mock data.
    return { content: `[sandbox] Contents of file`, error: undefined };
  },
});

export const writeFileTool = createTool({
  id: "write_file",
  description: "Write content to a file at the given path.",
  inputSchema: z.object({
    path: z.string().describe("File path to write"),
    content: z.string().describe("Content to write"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    error: z.string().optional(),
  }),
  execute: async (_input) => {
    return { success: true, error: undefined };
  },
});

export const searchTool = createTool({
  id: "search",
  description: "Search for a pattern across files in a directory.",
  inputSchema: z.object({
    pattern: z.string().describe("Search pattern (regex)"),
    directory: z.string().optional().describe("Directory to search in"),
  }),
  outputSchema: z.object({
    matches: z.array(z.object({
      file: z.string(),
      line: z.number(),
      content: z.string(),
    })),
    error: z.string().optional(),
  }),
  execute: async (_input) => {
    return { matches: [] as Array<{ file: string; line: number; content: string }>, error: undefined };
  },
});

export const executeCommandTool = createTool({
  id: "execute_command",
  description: "Execute a shell command and return the output.",
  inputSchema: z.object({
    command: z.string().describe("Shell command to execute"),
    timeout: z.number().optional().describe("Timeout in milliseconds"),
  }),
  outputSchema: z.object({
    stdout: z.string(),
    stderr: z.string(),
    exitCode: z.number(),
    error: z.string().optional(),
  }),
  execute: async (_input) => {
    return { stdout: "", stderr: "", exitCode: 0, error: undefined };
  },
});

// ─── Tool Type Helper ────────────────────────────────────────
// Mastra Tool has complex generics; use a simpler alias for our registry.

type AnyTool = Tool<any, any, any, any, any, any, any>;

// ─── Capability Registry ─────────────────────────────────────

const PRIMER_CAPABILITIES: Array<{
  name: string;
  slug: string;
  description: string;
  tools: AnyTool[];
}> = [
  {
    name: "File Operations",
    slug: "file_ops",
    description: "Read, write, and search files",
    tools: [readFileTool, writeFileTool, searchTool],
  },
  {
    name: "Command Execution",
    slug: "command_exec",
    description: "Execute shell commands safely",
    tools: [executeCommandTool],
  },
  {
    name: "Tool Composition",
    slug: "tool_composition",
    description: "Combine multiple tools to solve complex tasks",
    tools: [readFileTool, writeFileTool, searchTool, executeCommandTool],
  },
];

/**
 * Get the tool set for a given capability slug.
 * Returns all tools if no capability specified (for general-purpose agents).
 */
export function getToolsForCapability(capabilitySlug?: string): AnyTool[] {
  if (!capabilitySlug) {
    // Return all unique tools
    const seen = new Set<string>();
    const tools: AnyTool[] = [];
    for (const cap of PRIMER_CAPABILITIES) {
      for (const tool of cap.tools) {
        if (!seen.has(tool.id)) {
          seen.add(tool.id);
          tools.push(tool);
        }
      }
    }
    return tools;
  }

  const cap = PRIMER_CAPABILITIES.find((c) => c.slug === capabilitySlug);
  return cap?.tools ?? [];
}

// ─── Agent Factory ───────────────────────────────────────────

/**
 * Create a Mastra Agent configured for Primer task execution.
 *
 * The agent is preconfigured with:
 * - Tools appropriate for the task's capability area
 * - System instructions that frame the agent as a learner
 * - Budget constraints from RuntimeConfig
 */
export function createPrimerAgent(
  capabilitySlug?: string,
  config: RuntimeConfig = DEFAULT_RUNTIME_CONFIG
): Agent {
  const tools = getToolsForCapability(capabilitySlug);
  const toolRecord: Record<string, AnyTool> = {};
  for (const tool of tools) {
    toolRecord[tool.id] = tool;
  }

  return new Agent({
    id: "primer-learner",
    name: "Primer Learner Agent",
    instructions: `You are an AI agent being evaluated on your tool-use capabilities.
Your goal is to complete the given task correctly and efficiently.

Constraints:
- You have a budget of ${config.toolCallLimit} tool calls. Use them wisely.
- Think step-by-step before acting.
- If a tool call fails, try to recover rather than giving up.
- Explain your reasoning briefly before each tool call.`,
    model: config.modelId ?? "openai/gpt-4o-mini",
    tools: toolRecord,
  });
}

// ─── Task Execution ──────────────────────────────────────────

/**
 * Execute a task with budget enforcement and timeout.
 *
 * This is the core execution function. It:
 * 1. Creates an agent with appropriate tools
 * 2. Runs the agent against the task prompt
 * 3. Enforces token and tool call budgets
 * 4. Supports suspend/resume for human-in-the-loop
 *
 * Returns a structured result ready for evaluation.
 */
export async function executeTask(
  ctx: TaskExecutionContext
): Promise<TaskExecutionResult> {
  const startTime = Date.now();
  let tokenCount = 0;
  let toolCallCount = 0;

  try {
    const agent = createPrimerAgent(undefined, ctx.config);

    // Execute with timeout (clear timer on completion to avoid holding the event loop)
    let timeoutHandle: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => reject(new Error("TASK_TIMEOUT")), ctx.config.timeoutMs);
    });

    const executionPromise = agent.generate(ctx.prompt, {
      maxSteps: ctx.config.toolCallLimit,
    });

    let result: Awaited<typeof executionPromise>;
    try {
      result = await Promise.race([executionPromise, timeoutPromise]);
    } finally {
      clearTimeout(timeoutHandle!);
    }

    const durationMs = Date.now() - startTime;

    // Extract tool calls from the result
    const toolCalls = (result as any).steps
      ?.flatMap((step: any) => step.toolCalls ?? [])
      ?.map((tc: any) => ({
        tool: tc.toolName ?? tc.tool,
        arguments: tc.args ?? tc.arguments,
        result: tc.result,
      })) ?? [];

    toolCallCount = toolCalls.length;
    tokenCount = (result as any).usage?.totalTokens ?? 0;

    // Budget enforcement (post-hoc: tokens are checked after execution completes,
    // not mid-stream. Mastra's maxSteps handles tool call limits pre-emptively,
    // but token budgets are advisory — the response is still returned, just flagged.)
    if (tokenCount > ctx.config.tokenBudget) {
      return {
        status: "budget_exceeded",
        response: { text: (result as any).text, toolCalls },
        tokenCount,
        toolCallCount,
        durationMs,
        error: `Token budget exceeded: ${tokenCount}/${ctx.config.tokenBudget}`,
      };
    }

    return {
      status: "completed",
      response: {
        text: (result as any).text,
        toolCalls,
      },
      tokenCount,
      toolCallCount,
      durationMs,
    };
  } catch (err: any) {
    const durationMs = Date.now() - startTime;

    if (err.message === "TASK_TIMEOUT") {
      return {
        status: "timeout",
        tokenCount,
        toolCallCount,
        durationMs,
        error: `Task timed out after ${ctx.config.timeoutMs}ms`,
      };
    }

    return {
      status: "failed",
      tokenCount,
      toolCallCount,
      durationMs,
      error: err.message ?? "Unknown execution error",
    };
  }
}

// ─── Suspend / Resume ────────────────────────────────────────

/**
 * Suspend state for human-in-the-loop approval.
 * Stored in-memory for now; BullMQ job data handles persistence.
 */
const suspendedTasks = new Map<string, {
  context: TaskExecutionContext;
  partialResult: Partial<TaskExecutionResult>;
  suspendedAt: Date;
}>();

/**
 * Suspend a task execution for human review.
 * The task can be resumed later with `resumeTask`.
 */
export function suspendTask(
  taskId: string,
  context: TaskExecutionContext,
  partialResult: Partial<TaskExecutionResult>
): void {
  suspendedTasks.set(taskId, {
    context,
    partialResult,
    suspendedAt: new Date(),
  });
}

/**
 * Resume a previously suspended task.
 * Returns null if the task wasn't found in suspended state.
 */
export function resumeTask(
  taskId: string,
  approved: boolean
): { context: TaskExecutionContext; approved: boolean } | null {
  const suspended = suspendedTasks.get(taskId);
  if (!suspended) return null;

  suspendedTasks.delete(taskId);

  return {
    context: suspended.context,
    approved,
  };
}

/**
 * Get all currently suspended tasks.
 */
export function getSuspendedTasks(): Array<{
  taskId: string;
  agentId: string;
  suspendedAt: Date;
}> {
  return Array.from(suspendedTasks.entries()).map(([taskId, state]) => ({
    taskId,
    agentId: state.context.agentId,
    suspendedAt: state.suspendedAt,
  }));
}
