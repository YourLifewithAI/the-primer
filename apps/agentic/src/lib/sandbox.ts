/**
 * Sandbox Service — E2B code execution integration.
 *
 * Sprint 3A: Secure sandboxed code execution for agent-submitted code.
 *
 * Key design:
 * - Firecracker microVMs via E2B provide hardware-level isolation
 * - 150ms startup time per sandbox
 * - Timeout controls, output capture, resource limits
 * - Integrates with the evaluation engine: agents can be tested on
 *   actual code execution, not just regex matching against expected output
 *
 * Security model (from research):
 * - Never give agents production database write access
 * - All agent code runs inside E2B sandboxes
 * - Per-execution timeout and output size limits
 * - Sandboxes are ephemeral — destroyed after each execution
 */

import { Sandbox } from "@e2b/code-interpreter";

// ─── Types ───────────────────────────────────────────────────

export interface SandboxConfig {
  /** Timeout for the sandbox session in seconds (default: 30) */
  timeoutSec: number;
  /** Max output size in bytes (default: 100KB) */
  maxOutputBytes: number;
  /** Language for code execution */
  language: "python" | "javascript" | "typescript" | "shell";
}

export interface ExecutionResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  /** Execution time in milliseconds */
  durationMs: number;
  /** Whether output was truncated due to size limits */
  truncated: boolean;
  error?: string;
}

export interface SandboxSession {
  id: string;
  sandbox: Sandbox;
  createdAt: Date;
  config: SandboxConfig;
}

// ─── Default Config ──────────────────────────────────────────

export const DEFAULT_SANDBOX_CONFIG: SandboxConfig = {
  timeoutSec: 30,
  maxOutputBytes: 100 * 1024, // 100KB
  language: "python",
};

// ─── Sandbox Service ─────────────────────────────────────────

/**
 * Execute code in an E2B sandbox.
 *
 * Creates an ephemeral sandbox, runs the code, captures output,
 * and destroys the sandbox. Each execution is fully isolated.
 *
 * Requires E2B_API_KEY in environment.
 *
 * @param code - The code to execute
 * @param config - Sandbox configuration (timeouts, limits)
 * @returns Execution result with stdout/stderr/exit code
 */
export async function executeInSandbox(
  code: string,
  config: Partial<SandboxConfig> = {}
): Promise<ExecutionResult> {
  const fullConfig: SandboxConfig = { ...DEFAULT_SANDBOX_CONFIG, ...config };
  const startTime = Date.now();

  const apiKey = process.env.E2B_API_KEY;
  if (!apiKey) {
    return {
      success: false,
      stdout: "",
      stderr: "",
      exitCode: 1,
      durationMs: Date.now() - startTime,
      truncated: false,
      error: "E2B_API_KEY not set — sandbox execution unavailable",
    };
  }

  let sandbox: Sandbox | null = null;

  try {
    // Create sandbox with timeout
    sandbox = await Sandbox.create({
      timeoutMs: fullConfig.timeoutSec * 1000,
    });

    // Execute code based on language
    const execution = await sandbox.runCode(code, {
      language: fullConfig.language === "shell" ? "python" : fullConfig.language,
      timeoutMs: fullConfig.timeoutSec * 1000,
    });

    const durationMs = Date.now() - startTime;

    // Capture and potentially truncate output
    let stdout = "";
    let stderr = "";
    let truncated = false;

    // Collect stdout from execution results
    if (execution.results && execution.results.length > 0) {
      stdout = execution.results
        .map((r: any) => r.text ?? r.toString?.() ?? "")
        .join("\n");
    }
    if (execution.logs) {
      const logStdout = (execution.logs as any).stdout ?? [];
      const logStderr = (execution.logs as any).stderr ?? [];
      if (Array.isArray(logStdout)) {
        stdout += logStdout.join("\n");
      }
      if (Array.isArray(logStderr)) {
        stderr += logStderr.join("\n");
      }
    }
    if (execution.error) {
      stderr += `\n${execution.error.name}: ${execution.error.value}\n${execution.error.traceback}`;
    }

    // Truncate if needed
    if (stdout.length > fullConfig.maxOutputBytes) {
      stdout = stdout.slice(0, fullConfig.maxOutputBytes) + "\n[OUTPUT TRUNCATED]";
      truncated = true;
    }
    if (stderr.length > fullConfig.maxOutputBytes) {
      stderr = stderr.slice(0, fullConfig.maxOutputBytes) + "\n[OUTPUT TRUNCATED]";
      truncated = true;
    }

    return {
      success: !execution.error,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      exitCode: execution.error ? 1 : 0,
      durationMs,
      truncated,
    };
  } catch (err: any) {
    const durationMs = Date.now() - startTime;

    // Handle timeout specifically
    if (err.message?.includes("timeout") || err.message?.includes("Timeout")) {
      return {
        success: false,
        stdout: "",
        stderr: "",
        exitCode: 124, // Standard timeout exit code
        durationMs,
        truncated: false,
        error: `Execution timed out after ${fullConfig.timeoutSec}s`,
      };
    }

    return {
      success: false,
      stdout: "",
      stderr: "",
      exitCode: 1,
      durationMs,
      truncated: false,
      error: err.message ?? "Unknown sandbox error",
    };
  } finally {
    // Always destroy the sandbox
    if (sandbox) {
      try {
        await sandbox.kill();
      } catch {
        // Best-effort cleanup
      }
    }
  }
}

/**
 * Execute code and evaluate the output against expected results.
 *
 * This is the bridge between the sandbox and the evaluation engine.
 * Instead of regex-matching agent responses, we actually run the code
 * and compare the output.
 *
 * @param code - Agent-submitted code
 * @param expectedOutput - Expected stdout (exact or pattern)
 * @param config - Sandbox configuration
 * @returns Execution result with a match indicator
 */
export async function executeAndValidate(
  code: string,
  expectedOutput: string | RegExp,
  config: Partial<SandboxConfig> = {}
): Promise<ExecutionResult & { outputMatches: boolean }> {
  const result = await executeInSandbox(code, config);

  let outputMatches = false;
  if (result.success) {
    if (typeof expectedOutput === "string") {
      // Normalize whitespace for comparison
      const normalizedActual = result.stdout.trim().replace(/\s+/g, " ");
      const normalizedExpected = expectedOutput.trim().replace(/\s+/g, " ");
      outputMatches = normalizedActual === normalizedExpected ||
        normalizedActual.includes(normalizedExpected);
    } else {
      outputMatches = expectedOutput.test(result.stdout);
    }
  }

  return { ...result, outputMatches };
}

/**
 * Write a file into a sandbox and then execute code that uses it.
 *
 * Useful for tasks where the agent needs to process a file:
 * "Read this CSV and compute the average of column X."
 *
 * @param files - Files to write into the sandbox (path → content)
 * @param code - Code to execute after files are written
 * @param config - Sandbox configuration
 */
export async function executeWithFiles(
  files: Record<string, string>,
  code: string,
  config: Partial<SandboxConfig> = {}
): Promise<ExecutionResult> {
  const fullConfig: SandboxConfig = { ...DEFAULT_SANDBOX_CONFIG, ...config };
  const startTime = Date.now();

  const apiKey = process.env.E2B_API_KEY;
  if (!apiKey) {
    return {
      success: false,
      stdout: "",
      stderr: "",
      exitCode: 1,
      durationMs: Date.now() - startTime,
      truncated: false,
      error: "E2B_API_KEY not set — sandbox execution unavailable",
    };
  }

  let sandbox: Sandbox | null = null;

  try {
    sandbox = await Sandbox.create({
      timeoutMs: fullConfig.timeoutSec * 1000,
    });

    // Write files into the sandbox
    for (const [path, content] of Object.entries(files)) {
      await sandbox.files.write(path, content);
    }

    // Execute the code
    const execution = await sandbox.runCode(code, {
      language: fullConfig.language === "shell" ? "python" : fullConfig.language,
      timeoutMs: fullConfig.timeoutSec * 1000,
    });

    const durationMs = Date.now() - startTime;

    let stdout = "";
    let stderr = "";
    let truncated = false;

    if (execution.results && execution.results.length > 0) {
      stdout = execution.results
        .map((r: any) => r.text ?? r.toString?.() ?? "")
        .join("\n");
    }
    if (execution.logs) {
      const logStdout = (execution.logs as any).stdout ?? [];
      const logStderr = (execution.logs as any).stderr ?? [];
      if (Array.isArray(logStdout)) stdout += logStdout.join("\n");
      if (Array.isArray(logStderr)) stderr += logStderr.join("\n");
    }
    if (execution.error) {
      stderr += `\n${execution.error.name}: ${execution.error.value}\n${execution.error.traceback}`;
    }

    if (stdout.length > fullConfig.maxOutputBytes) {
      stdout = stdout.slice(0, fullConfig.maxOutputBytes) + "\n[OUTPUT TRUNCATED]";
      truncated = true;
    }

    return {
      success: !execution.error,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      exitCode: execution.error ? 1 : 0,
      durationMs,
      truncated,
    };
  } catch (err: any) {
    return {
      success: false,
      stdout: "",
      stderr: "",
      exitCode: 1,
      durationMs: Date.now() - startTime,
      truncated: false,
      error: err.message ?? "Unknown sandbox error",
    };
  } finally {
    if (sandbox) {
      try {
        await sandbox.kill();
      } catch {
        // Best-effort cleanup
      }
    }
  }
}
