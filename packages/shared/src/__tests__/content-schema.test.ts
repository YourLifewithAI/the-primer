/**
 * Tests for the content validation schema.
 */

import { describe, it, expect } from "vitest";
import {
  validateCourse,
  type CourseDefinition,
  type KCDefinition,
  type ModuleDefinition,
} from "../content-schema";

function makeKC(overrides: Partial<KCDefinition> = {}): KCDefinition {
  return {
    id: "kc_test_1",
    name: "Test KC",
    description: "A test knowledge component",
    subject: "MATH",
    gradeLevels: [5],
    prerequisites: [],
    ...overrides,
  };
}

function makeValidCourse(overrides: Partial<CourseDefinition> = {}): CourseDefinition {
  return {
    id: "test-course",
    title: "Test Course",
    description: "A test course",
    subject: "MATH",
    gradeLevels: [5],
    license: "CC-BY-4.0",
    knowledgeComponents: [makeKC()],
    modules: [
      {
        id: "mod_1",
        title: "Module 1",
        lessons: [
          {
            id: "lesson_1",
            title: "Lesson 1",
            problems: [
              {
                id: "prob_1",
                title: "Problem 1",
                difficulty: 3,
                steps: [
                  {
                    id: "step_1",
                    prompt: "What is 2+2?",
                    correctAnswer: "4",
                    kcs: ["kc_test_1"],
                    hints: [
                      {
                        type: "scaffold",
                        content: "Think about counting",
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe("Content Schema Validation", () => {
  describe("validateCourse", () => {
    it("returns no errors for a valid course", () => {
      const course = makeValidCourse();
      const errors = validateCourse(course);
      expect(errors).toHaveLength(0);
    });

    it("detects duplicate KC IDs", () => {
      const course = makeValidCourse({
        knowledgeComponents: [
          makeKC({ id: "kc_dup" }),
          makeKC({ id: "kc_dup" }),
        ],
      });
      const errors = validateCourse(course);
      expect(errors.some((e) => e.message.includes("Duplicate KC ID"))).toBe(true);
    });

    it("detects invalid prerequisite references", () => {
      const course = makeValidCourse({
        knowledgeComponents: [
          makeKC({ id: "kc_1", prerequisites: ["kc_nonexistent"] }),
        ],
      });
      const errors = validateCourse(course);
      expect(
        errors.some((e) => e.message.includes("not found in course KCs"))
      ).toBe(true);
    });

    it("detects lesson with no problems", () => {
      const course = makeValidCourse({
        modules: [
          {
            id: "mod_1",
            title: "Module 1",
            lessons: [
              {
                id: "lesson_empty",
                title: "Empty Lesson",
                problems: [],
              },
            ],
          },
        ],
      });
      const errors = validateCourse(course);
      expect(errors.some((e) => e.message.includes("no problems"))).toBe(true);
    });

    it("detects problem with no steps", () => {
      const course = makeValidCourse({
        modules: [
          {
            id: "mod_1",
            title: "Module 1",
            lessons: [
              {
                id: "lesson_1",
                title: "Lesson 1",
                problems: [
                  {
                    id: "prob_no_steps",
                    title: "No Steps",
                    difficulty: 3,
                    steps: [],
                  },
                ],
              },
            ],
          },
        ],
      });
      const errors = validateCourse(course);
      expect(errors.some((e) => e.message.includes("no steps"))).toBe(true);
    });

    it("detects invalid difficulty", () => {
      const course = makeValidCourse();
      course.modules[0].lessons[0].problems[0].difficulty = 7;
      const errors = validateCourse(course);
      expect(errors.some((e) => e.message.includes("Difficulty must be 1-5"))).toBe(
        true
      );
    });

    it("detects step with no KC references", () => {
      const course = makeValidCourse();
      course.modules[0].lessons[0].problems[0].steps[0].kcs = [];
      const errors = validateCourse(course);
      expect(errors.some((e) => e.message.includes("no KC references"))).toBe(true);
    });

    it("detects step referencing undefined KC", () => {
      const course = makeValidCourse();
      course.modules[0].lessons[0].problems[0].steps[0].kcs = ["kc_missing"];
      const errors = validateCourse(course);
      expect(errors.some((e) => e.message.includes('"kc_missing" not found'))).toBe(
        true
      );
    });

    it("detects step with no hints", () => {
      const course = makeValidCourse();
      course.modules[0].lessons[0].problems[0].steps[0].hints = [];
      const errors = validateCourse(course);
      expect(errors.some((e) => e.message.includes("no hints"))).toBe(true);
    });

    it("detects duplicate module IDs", () => {
      const course = makeValidCourse({
        modules: [
          {
            id: "mod_dup",
            title: "Module 1",
            lessons: [
              {
                id: "lesson_1",
                title: "L1",
                problems: [
                  {
                    id: "prob_1",
                    title: "P1",
                    difficulty: 1,
                    steps: [
                      {
                        id: "s1",
                        prompt: "Q?",
                        correctAnswer: "A",
                        kcs: ["kc_test_1"],
                        hints: [{ type: "scaffold", content: "H" }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          {
            id: "mod_dup",
            title: "Module 2",
            lessons: [
              {
                id: "lesson_2",
                title: "L2",
                problems: [
                  {
                    id: "prob_2",
                    title: "P2",
                    difficulty: 1,
                    steps: [
                      {
                        id: "s2",
                        prompt: "Q?",
                        correctAnswer: "A",
                        kcs: ["kc_test_1"],
                        hints: [{ type: "scaffold", content: "H" }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      });
      const errors = validateCourse(course);
      expect(errors.some((e) => e.message.includes("Duplicate module ID"))).toBe(
        true
      );
    });
  });
});
