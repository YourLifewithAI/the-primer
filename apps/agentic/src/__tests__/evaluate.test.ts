/**
 * Tests for the rubric-based evaluation engine.
 */

import { describe, it, expect } from "vitest";
import { evaluate, type Rubric } from "../lib/evaluate";

describe("Evaluation Engine", () => {
  // ─── tool_selected ──────────────────────────────────────────

  describe("tool_selected criterion", () => {
    it("scores 1.0 when correct tool is used", () => {
      const result = evaluate(
        { toolCalls: [{ tool: "read_file" }] },
        {
          criteria: [
            { type: "tool_selected", weight: 1, expected: "read_file" },
          ],
        }
      );
      expect(result.criteriaScores["tool_selected"]).toBe(1.0);
      expect(result.correct).toBe(true);
    });

    it("scores 0 when wrong tool is used", () => {
      const result = evaluate(
        { toolCalls: [{ tool: "write_file" }] },
        {
          criteria: [
            { type: "tool_selected", weight: 1, expected: "read_file" },
          ],
        }
      );
      expect(result.criteriaScores["tool_selected"]).toBe(0);
    });

    it("scores 0 when no tool calls exist", () => {
      const result = evaluate(
        { text: "I would use read_file" },
        {
          criteria: [
            { type: "tool_selected", weight: 1, expected: "read_file" },
          ],
        }
      );
      expect(result.criteriaScores["tool_selected"]).toBe(0);
    });

    it("supports array of expected tools", () => {
      const result = evaluate(
        { toolCalls: [{ tool: "grep" }] },
        {
          criteria: [
            {
              type: "tool_selected",
              weight: 1,
              expected: ["grep", "search"],
            },
          ],
        }
      );
      expect(result.criteriaScores["tool_selected"]).toBe(1.0);
    });

    it("matches partial tool names (includes check)", () => {
      const result = evaluate(
        { toolCalls: [{ tool: "bash_command" }] },
        {
          criteria: [
            { type: "tool_selected", weight: 1, expected: "bash" },
          ],
        }
      );
      expect(result.criteriaScores["tool_selected"]).toBe(1.0);
    });
  });

  // ─── argument_valid ─────────────────────────────────────────

  describe("argument_valid criterion", () => {
    it("scores 1.0 when argument matches expected", () => {
      const result = evaluate(
        {
          toolCalls: [
            { tool: "read_file", arguments: { path: "/src/index.ts" } },
          ],
        },
        {
          criteria: [
            {
              type: "argument_valid",
              weight: 1,
              key: "path",
              expected: "/src/index.ts",
            },
          ],
        }
      );
      expect(result.criteriaScores["argument_valid:path"]).toBe(1.0);
    });

    it("scores 0 when argument is wrong", () => {
      const result = evaluate(
        {
          toolCalls: [
            { tool: "read_file", arguments: { path: "/wrong/path.ts" } },
          ],
        },
        {
          criteria: [
            {
              type: "argument_valid",
              weight: 1,
              key: "path",
              expected: "/src/index.ts",
            },
          ],
        }
      );
      expect(result.criteriaScores["argument_valid:path"]).toBe(0);
    });

    it("matches with regex pattern", () => {
      const result = evaluate(
        {
          toolCalls: [
            { tool: "read_file", arguments: { path: "/src/utils/helper.ts" } },
          ],
        },
        {
          criteria: [
            {
              type: "argument_valid",
              weight: 1,
              key: "path",
              pattern: "\\/src\\/.*\\.ts$",
            },
          ],
        }
      );
      expect(result.criteriaScores["argument_valid:path"]).toBe(1.0);
    });

    it("scores 1.0 when arg exists and no expected/pattern given", () => {
      const result = evaluate(
        {
          toolCalls: [
            { tool: "read_file", arguments: { path: "/anything.ts" } },
          ],
        },
        {
          criteria: [
            { type: "argument_valid", weight: 1, key: "path" },
          ],
        }
      );
      expect(result.criteriaScores["argument_valid:path"]).toBe(1.0);
    });

    it("scores 0 when key is missing", () => {
      const result = evaluate(
        {
          toolCalls: [{ tool: "read_file", arguments: {} }],
        },
        {
          criteria: [
            { type: "argument_valid", weight: 1, key: "path" },
          ],
        }
      );
      expect(result.criteriaScores["argument_valid:path"]).toBe(0);
    });
  });

  // ─── result_correct ─────────────────────────────────────────

  describe("result_correct criterion", () => {
    it("scores 1.0 when expected text is in tool result", () => {
      const result = evaluate(
        {
          toolCalls: [
            {
              tool: "read_file",
              result: 'const config = { port: 3000 }',
            },
          ],
        },
        {
          criteria: [
            {
              type: "result_correct",
              weight: 1,
              expected: "port: 3000",
            },
          ],
        }
      );
      expect(result.criteriaScores["result_correct"]).toBe(1.0);
    });

    it("searches tool call arguments too", () => {
      const result = evaluate(
        {
          toolCalls: [
            {
              tool: "read_file",
              arguments: { path: "/correct/path.ts" },
              result: "file contents",
            },
          ],
        },
        {
          criteria: [
            {
              type: "result_correct",
              weight: 1,
              expected: "/correct/path.ts",
            },
          ],
        }
      );
      expect(result.criteriaScores["result_correct"]).toBe(1.0);
    });

    it("scores 0 when expected text is missing", () => {
      const result = evaluate(
        { toolCalls: [{ tool: "read_file", result: "nothing relevant" }] },
        {
          criteria: [
            {
              type: "result_correct",
              weight: 1,
              expected: "critical_value",
            },
          ],
        }
      );
      expect(result.criteriaScores["result_correct"]).toBe(0);
    });

    it("matches with regex pattern", () => {
      const result = evaluate(
        { text: "The answer is 42 items" },
        {
          criteria: [
            {
              type: "result_correct",
              weight: 1,
              pattern: "\\d+ items",
            },
          ],
        }
      );
      expect(result.criteriaScores["result_correct"]).toBe(1.0);
    });

    it("scores 0.5 for non-empty text without expected/pattern", () => {
      const result = evaluate(
        { text: "some output" },
        {
          criteria: [{ type: "result_correct", weight: 1 }],
        }
      );
      expect(result.criteriaScores["result_correct"]).toBe(0.5);
    });
  });

  // ─── format_correct ─────────────────────────────────────────

  describe("format_correct criterion", () => {
    it("scores 1.0 when tool calls exist", () => {
      const result = evaluate(
        { toolCalls: [{ tool: "any_tool" }] },
        {
          criteria: [{ type: "format_correct", weight: 1 }],
        }
      );
      expect(result.criteriaScores["format_correct"]).toBe(1.0);
    });

    it("matches regex pattern in text", () => {
      const result = evaluate(
        { text: "```json\n{}\n```" },
        {
          criteria: [
            {
              type: "format_correct",
              weight: 1,
              pattern: "```json",
            },
          ],
        }
      );
      expect(result.criteriaScores["format_correct"]).toBe(1.0);
    });
  });

  // ─── error_handled ──────────────────────────────────────────

  describe("error_handled criterion", () => {
    it("scores 1.0 when no errors occur", () => {
      const result = evaluate(
        { toolCalls: [{ tool: "read_file", result: "file contents" }] },
        {
          criteria: [{ type: "error_handled", weight: 1 }],
        }
      );
      expect(result.criteriaScores["error_handled"]).toBe(1.0);
    });

    it("scores 1.0 when agent recovers from error", () => {
      const result = evaluate(
        {
          toolCalls: [
            { tool: "read_file", result: "Error: ENOENT file not found" },
            { tool: "read_file", result: "file contents" },
          ],
        },
        {
          criteria: [{ type: "error_handled", weight: 1 }],
        }
      );
      expect(result.criteriaScores["error_handled"]).toBe(1.0);
    });

    it("scores 0 when error is not recovered", () => {
      const result = evaluate(
        {
          toolCalls: [
            { tool: "read_file", result: "Error: ENOENT file not found" },
          ],
        },
        {
          criteria: [{ type: "error_handled", weight: 1 }],
        }
      );
      expect(result.criteriaScores["error_handled"]).toBe(0);
    });
  });

  // ─── sequence_valid ─────────────────────────────────────────

  describe("sequence_valid criterion", () => {
    it("scores 1.0 when tool sequence matches", () => {
      const result = evaluate(
        {
          toolCalls: [
            { tool: "grep" },
            { tool: "read_file" },
          ],
        },
        {
          criteria: [
            {
              type: "sequence_valid",
              weight: 1,
              expected: ["grep", "read_file"],
            },
          ],
        }
      );
      expect(result.criteriaScores["sequence_valid"]).toBe(1.0);
    });

    it("allows extra tools between expected sequence", () => {
      const result = evaluate(
        {
          toolCalls: [
            { tool: "grep" },
            { tool: "list_files" },
            { tool: "read_file" },
          ],
        },
        {
          criteria: [
            {
              type: "sequence_valid",
              weight: 1,
              expected: ["grep", "read_file"],
            },
          ],
        }
      );
      expect(result.criteriaScores["sequence_valid"]).toBe(1.0);
    });

    it("scores partial when only some sequence steps match", () => {
      const result = evaluate(
        {
          toolCalls: [{ tool: "grep" }],
        },
        {
          criteria: [
            {
              type: "sequence_valid",
              weight: 1,
              expected: ["grep", "read_file"],
            },
          ],
        }
      );
      expect(result.criteriaScores["sequence_valid"]).toBe(0.5);
    });

    it("supports regex in expected tools", () => {
      const result = evaluate(
        {
          toolCalls: [{ tool: "search" }],
        },
        {
          criteria: [
            {
              type: "sequence_valid",
              weight: 1,
              expected: ["grep|search"],
            },
          ],
        }
      );
      expect(result.criteriaScores["sequence_valid"]).toBe(1.0);
    });

    it("scores 1.0 when expected is not an array", () => {
      const result = evaluate(
        { toolCalls: [{ tool: "any" }] },
        {
          criteria: [
            { type: "sequence_valid", weight: 1, expected: "single" },
          ],
        }
      );
      expect(result.criteriaScores["sequence_valid"]).toBe(1.0);
    });
  });

  // ─── Overall scoring ───────────────────────────────────────

  describe("overall scoring", () => {
    it("computes weighted score across criteria", () => {
      const result = evaluate(
        { toolCalls: [{ tool: "read_file" }] },
        {
          criteria: [
            { type: "tool_selected", weight: 2, expected: "read_file" },
            { type: "format_correct", weight: 1 },
          ],
        }
      );
      // tool_selected=1.0*2 + format_correct=1.0*1 = 3/3 = 1.0
      expect(result.score).toBe(1.0);
      expect(result.correct).toBe(true);
    });

    it("marks incorrect when below pass threshold", () => {
      const result = evaluate(
        { toolCalls: [{ tool: "wrong_tool" }] },
        {
          criteria: [
            { type: "tool_selected", weight: 1, expected: "read_file" },
          ],
          passThreshold: 0.7,
        }
      );
      expect(result.correct).toBe(false);
    });

    it("uses default passThreshold of 0.7", () => {
      const result = evaluate(
        { toolCalls: [{ tool: "read_file" }] },
        {
          criteria: [
            { type: "tool_selected", weight: 1, expected: "read_file" },
          ],
        }
      );
      // Score is 1.0, default threshold is 0.7
      expect(result.correct).toBe(true);
    });

    it("returns descriptive notes for failed criteria", () => {
      const result = evaluate(
        { toolCalls: [{ tool: "wrong" }] },
        {
          criteria: [
            {
              type: "tool_selected",
              weight: 1,
              expected: "read_file",
              description: "Should use read_file",
            },
          ],
        }
      );
      expect(result.notes).toContain("Should use read_file");
    });

    it('returns "All criteria met" when everything passes', () => {
      const result = evaluate(
        { toolCalls: [{ tool: "read_file" }] },
        {
          criteria: [
            { type: "tool_selected", weight: 1, expected: "read_file" },
          ],
        }
      );
      expect(result.notes).toBe("All criteria met");
    });
  });
});
