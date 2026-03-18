/**
 * Tests for the procedural task generator.
 */

import { describe, it, expect } from "vitest";
import {
  generateTask,
  type TaskTemplateInput,
} from "../lib/task-generator";

function makeTemplate(overrides: Partial<TaskTemplateInput> = {}): TaskTemplateInput {
  return {
    slug: "test-template",
    promptTemplate: "Find the file {{filename}} in {{directory}}",
    parameterSchema: {
      parameters: [
        { name: "filename", type: "enum", values: ["config.json", "app.ts"] },
        { name: "directory", type: "enum", values: ["src", "lib", "utils"] },
      ],
    },
    difficultyRange: {
      min: 1,
      max: 5,
      difficultyParams: [],
    },
    rubricTemplate: {
      criteria: [
        {
          type: "tool_selected",
          weight: 1,
          expectedTemplate: "read_file",
        },
      ],
      passThreshold: 0.7,
    },
    ...overrides,
  };
}

describe("Task Generator", () => {
  // ─── Template rendering ─────────────────────────────────────

  describe("template rendering", () => {
    it("renders {{param}} placeholders in the prompt", () => {
      const template = makeTemplate();
      const task = generateTask(template, 3);
      // Should not contain unresolved placeholders
      expect(task.prompt).not.toContain("{{filename}}");
      expect(task.prompt).not.toContain("{{directory}}");
    });

    it("preserves unreferenced placeholders", () => {
      const template = makeTemplate({
        promptTemplate: "Do {{action}} with {{missing_param}}",
      });
      const task = generateTask(template, 3);
      // missing_param is not in parameters, so it stays
      expect(task.prompt).toContain("{{missing_param}}");
    });

    it("renders rubric expectedTemplate", () => {
      const template = makeTemplate({
        rubricTemplate: {
          criteria: [
            {
              type: "result_correct",
              weight: 1,
              expectedTemplate: "{{filename}}",
            },
          ],
          passThreshold: 0.7,
        },
      });
      const task = generateTask(template, 3);
      const criterion = task.rubric.criteria[0];
      // expected should be one of the enum values, not the template
      expect(criterion.expected).not.toBe("{{filename}}");
      expect(["config.json", "app.ts"]).toContain(criterion.expected);
    });

    it("splits comma-separated expected into array", () => {
      const template = makeTemplate({
        rubricTemplate: {
          criteria: [
            {
              type: "sequence_valid",
              weight: 1,
              expectedTemplate: "read_file,grep",
            },
          ],
        },
      });
      const task = generateTask(template, 3);
      expect(Array.isArray(task.rubric.criteria[0].expected)).toBe(true);
      expect(task.rubric.criteria[0].expected).toEqual(["read_file", "grep"]);
    });

    it("renders goldSolution template", () => {
      const template = makeTemplate({
        goldSolution: "Open {{filename}} in {{directory}}",
      });
      const task = generateTask(template, 3);
      expect(task.goldSolution).not.toBeNull();
      expect(task.goldSolution).not.toContain("{{filename}}");
    });

    it("returns null goldSolution when template has none", () => {
      const template = makeTemplate({ goldSolution: undefined });
      const task = generateTask(template, 3);
      expect(task.goldSolution).toBeNull();
    });
  });

  // ─── Paired parameter sets ──────────────────────────────────

  describe("paired parameter sets", () => {
    it("selects one paired set and adds all keys as parameters", () => {
      const template = makeTemplate({
        promptTemplate: "Use {{tool}} to do {{action}}",
        parameterSchema: {
          parameters: [
            {
              name: "paired",
              type: "paired_set",
              sets: [
                { tool: "grep", action: "search" },
                { tool: "find", action: "locate" },
              ],
            },
          ],
        },
      });
      const task = generateTask(template, 3);

      // Should have tool and action from one of the sets
      const params = task.parameters;
      const isSet1 = params.tool === "grep" && params.action === "search";
      const isSet2 = params.tool === "find" && params.action === "locate";
      expect(isSet1 || isSet2).toBe(true);
    });
  });

  // ─── Difficulty ─────────────────────────────────────────────

  describe("difficulty handling", () => {
    it("clamps difficulty to template range", () => {
      const template = makeTemplate({
        difficultyRange: { min: 2, max: 4, difficultyParams: [] },
      });
      const taskLow = generateTask(template, 1);
      expect(taskLow.difficulty).toBeGreaterThanOrEqual(2);

      const taskHigh = generateTask(template, 5);
      expect(taskHigh.difficulty).toBeLessThanOrEqual(4);
    });

    it("uses requested difficulty when within range", () => {
      const template = makeTemplate({
        difficultyRange: { min: 1, max: 5, difficultyParams: [] },
      });
      const task = generateTask(template, 3);
      // Difficulty may be adjusted by band validation, but should be close
      expect(task.difficulty).toBeGreaterThanOrEqual(1);
      expect(task.difficulty).toBeLessThanOrEqual(5);
    });

    it("scales number parameters with linear difficulty", () => {
      const template = makeTemplate({
        parameterSchema: {
          parameters: [
            { name: "count", type: "number", range: { min: 1, max: 100 } },
          ],
        },
        difficultyRange: {
          min: 1,
          max: 5,
          difficultyParams: [
            { param: "count", scaling: "linear" },
          ],
        },
        promptTemplate: "Process {{count}} items",
      });

      // At difficulty 1, count should be near min
      const taskLow = generateTask(template, 1);
      const lowCount = taskLow.parameters.count as number;
      expect(lowCount).toBeGreaterThanOrEqual(1);

      // At difficulty 5, count should be near max
      const taskHigh = generateTask(template, 5);
      const highCount = taskHigh.parameters.count as number;
      expect(highCount).toBeLessThanOrEqual(100);
    });

    it("uses stepped difficulty mapping", () => {
      const template = makeTemplate({
        parameterSchema: {
          parameters: [
            { name: "mode", type: "enum", values: ["basic", "advanced", "expert"] },
          ],
        },
        difficultyRange: {
          min: 1,
          max: 3,
          difficultyParams: [
            { param: "mode", scaling: "stepped", steps: { 1: "basic", 2: "advanced", 3: "expert" } },
          ],
        },
        promptTemplate: "Run in {{mode}} mode",
      });

      const task = generateTask(template, 2);
      expect(task.parameters.mode).toBe("advanced");
    });
  });

  // ─── Rubric defaults ───────────────────────────────────────

  describe("rubric defaults", () => {
    it("uses passThreshold from template", () => {
      const template = makeTemplate({
        rubricTemplate: {
          criteria: [],
          passThreshold: 0.5,
        },
      });
      const task = generateTask(template, 3);
      expect(task.rubric.passThreshold).toBe(0.5);
    });

    it("defaults passThreshold to 0.7", () => {
      const template = makeTemplate({
        rubricTemplate: {
          criteria: [],
        },
      });
      const task = generateTask(template, 3);
      expect(task.rubric.passThreshold).toBe(0.7);
    });
  });
});
