/**
 * Rubric-based evaluation engine for agent task responses.
 *
 * Supports 8 criterion types for tool-use evaluation:
 * - tool_selected: Did the agent choose the correct tool?
 * - argument_valid: Were the arguments correct?
 * - result_correct: Did the response contain the expected result?
 * - format_correct: Was the response in the expected format?
 * - error_handled: Did the agent handle errors appropriately?
 * - sequence_valid: Were tool calls in the correct order?
 * - plan_quality: Did the agent produce a structured plan? (L3)
 * - collaboration_quality: Did the agent appropriately collaborate? (L4)
 */

export interface Criterion {
  type: CriterionType;
  weight: number;
  expected?: string | string[];
  key?: string;          // For argument checking: which argument
  pattern?: string;      // Regex pattern for matching
  description?: string;  // Human-readable description
}

export type CriterionType =
  | "tool_selected"
  | "argument_valid"
  | "result_correct"
  | "format_correct"
  | "error_handled"
  | "sequence_valid"
  | "plan_quality"
  | "collaboration_quality";

export interface Rubric {
  criteria: Criterion[];
  passThreshold?: number; // Score >= this = correct (default 0.7)
}

export interface EvaluationResult {
  score: number;           // Weighted score [0.0, 1.0]
  correct: boolean;        // score >= passThreshold
  criteriaScores: Record<string, number>; // Per-criterion scores
  notes: string;           // Explanation
}

interface AgentResponse {
  toolCalls?: ToolCall[];
  text?: string;
  [key: string]: unknown;
}

interface ToolCall {
  tool: string;
  arguments?: Record<string, unknown>;
  result?: unknown;
}

/**
 * Evaluate an agent's response against a rubric.
 */
export function evaluate(response: AgentResponse, rubric: Rubric): EvaluationResult {
  const criteriaScores: Record<string, number> = {};
  const notes: string[] = [];
  let totalWeight = 0;
  let weightedSum = 0;

  for (const criterion of rubric.criteria) {
    const key = `${criterion.type}${criterion.key ? `:${criterion.key}` : ""}`;
    const score = evaluateCriterion(criterion, response);
    criteriaScores[key] = score;
    totalWeight += criterion.weight;
    weightedSum += score * criterion.weight;

    if (score < 1.0) {
      notes.push(`${key}: ${score.toFixed(2)} — ${criterion.description || criterion.type}`);
    }
  }

  const finalScore = totalWeight > 0 ? weightedSum / totalWeight : 0;
  const passThreshold = rubric.passThreshold ?? 0.7;

  return {
    score: Math.round(finalScore * 1000) / 1000,
    correct: finalScore >= passThreshold,
    criteriaScores,
    notes: notes.length > 0 ? notes.join("; ") : "All criteria met",
  };
}

function evaluateCriterion(criterion: Criterion, response: AgentResponse): number {
  switch (criterion.type) {
    case "tool_selected":
      return evaluateToolSelected(criterion, response);
    case "argument_valid":
      return evaluateArgumentValid(criterion, response);
    case "result_correct":
      return evaluateResultCorrect(criterion, response);
    case "format_correct":
      return evaluateFormatCorrect(criterion, response);
    case "error_handled":
      return evaluateErrorHandled(criterion, response);
    case "sequence_valid":
      return evaluateSequenceValid(criterion, response);
    case "plan_quality":
      return evaluatePlanQuality(criterion, response);
    case "collaboration_quality":
      return evaluateCollaborationQuality(criterion, response);
    default:
      return 0;
  }
}

function evaluateToolSelected(criterion: Criterion, response: AgentResponse): number {
  if (!response.toolCalls?.length) return 0;
  const expected = Array.isArray(criterion.expected) ? criterion.expected : [criterion.expected];
  const selectedTools = response.toolCalls.map((tc) => tc.tool);

  // Check if any selected tool matches any expected tool
  for (const exp of expected) {
    if (exp && selectedTools.some((t) => t === exp || t.includes(exp as string))) {
      return 1.0;
    }
  }
  return 0;
}

function evaluateArgumentValid(criterion: Criterion, response: AgentResponse): number {
  if (!response.toolCalls?.length || !criterion.key) return 0;

  for (const tc of response.toolCalls) {
    const argValue = tc.arguments?.[criterion.key];
    if (argValue === undefined) continue;

    if (criterion.expected) {
      const expected = Array.isArray(criterion.expected) ? criterion.expected : [criterion.expected];
      const argStr = String(argValue);
      if (expected.some((exp) => argStr === exp || argStr.includes(exp as string))) {
        return 1.0;
      }
    } else if (criterion.pattern) {
      const regex = new RegExp(criterion.pattern);
      if (regex.test(String(argValue))) {
        return 1.0;
      }
    } else {
      // Just check the argument exists and is non-empty
      return argValue !== null && argValue !== "" ? 1.0 : 0;
    }
  }
  return 0;
}

function evaluateResultCorrect(criterion: Criterion, response: AgentResponse): number {
  const text = response.text || "";
  const lastResult = response.toolCalls?.at(-1)?.result;
  // Also include tool call arguments in the searchable text — agents may
  // demonstrate correct results through their argument choices (e.g., using
  // the correct file path) even when the tool result itself is opaque content.
  const lastArgs = response.toolCalls?.at(-1)?.arguments;
  const allArgs = response.toolCalls?.map((tc) => JSON.stringify(tc.arguments || "")).join(" ") || "";
  const searchable = `${text} ${JSON.stringify(lastResult || "")} ${JSON.stringify(lastArgs || "")} ${allArgs}`;

  if (criterion.expected) {
    const expected = Array.isArray(criterion.expected) ? criterion.expected : [criterion.expected];
    return expected.some((exp) => searchable.includes(exp as string)) ? 1.0 : 0;
  }
  if (criterion.pattern) {
    return new RegExp(criterion.pattern).test(searchable) ? 1.0 : 0;
  }
  return searchable.trim().length > 0 ? 0.5 : 0;
}

function evaluateFormatCorrect(criterion: Criterion, response: AgentResponse): number {
  if (criterion.pattern) {
    const text = response.text || JSON.stringify(response);
    return new RegExp(criterion.pattern).test(text) ? 1.0 : 0;
  }
  // Check if response has tool calls (expected format for tool-use tasks)
  if (response.toolCalls?.length) return 1.0;
  return 0;
}

function evaluateErrorHandled(criterion: Criterion, response: AgentResponse): number {
  if (!response.toolCalls?.length) return 0;

  // Check if any tool call resulted in an error
  const hasErrors = response.toolCalls.some((tc) => {
    const result = String(tc.result || "");
    return result.includes("error") || result.includes("Error") || result.includes("ENOENT");
  });

  if (!hasErrors) return 1.0; // No errors to handle = pass

  // Check if agent took corrective action after error
  const errorIndex = response.toolCalls.findIndex((tc) => {
    const result = String(tc.result || "");
    return result.includes("error") || result.includes("Error");
  });

  // Did the agent make another tool call after the error?
  if (errorIndex >= 0 && errorIndex < response.toolCalls.length - 1) {
    return 1.0; // Attempted recovery
  }
  return 0;
}

function evaluateSequenceValid(criterion: Criterion, response: AgentResponse): number {
  if (!response.toolCalls?.length) return 0;
  if (!criterion.expected || !Array.isArray(criterion.expected)) return 1.0;

  const actual = response.toolCalls.map((tc) => tc.tool);
  const expected = criterion.expected as string[];

  // Check if actual sequence contains expected subsequence in order.
  // Each expected step is treated as a regex pattern, so "grep|search"
  // matches either tool name. This prevents rubric strictness when
  // multiple tools serve the same function (e.g., grep vs search).
  let expectedIdx = 0;
  for (const tool of actual) {
    if (expectedIdx < expected.length) {
      const pattern = new RegExp(`^(?:${expected[expectedIdx]})$`);
      if (pattern.test(tool)) {
        expectedIdx++;
      }
    }
  }
  return expectedIdx >= expected.length ? 1.0 : expectedIdx / expected.length;
}

/**
 * Evaluate plan quality for L3 planning tasks.
 *
 * Checks for structured planning artifacts in the response:
 * - Steps: numbered/bulleted items indicating a structured plan
 * - Dependencies: language indicating ordering constraints
 * - Tool references: mentions of specific tools for steps
 * - Step count: optionally validated against expected range (e.g., "3-7")
 *
 * Scores partial credit: each sub-check contributes equally.
 */
function evaluatePlanQuality(criterion: Criterion, response: AgentResponse): number {
  const text = response.text || "";
  if (!text.trim()) return 0;

  let checks = 0;
  let passed = 0;

  // Sub-check 1: Has numbered/bulleted steps
  checks++;
  const stepPatterns = /(?:^|\n)\s*(?:\d+[.)]\s|[-*]\s|step\s+\d)/im;
  if (stepPatterns.test(text)) passed++;

  // Sub-check 2: Has dependency/ordering language
  checks++;
  const depPattern = /\b(?:before|after|then|first|next|requires?|depends?\s+on|blocks?|precondition|prerequisite|parallel|sequential|once.*(?:complete|done|finish))\b/i;
  if (depPattern.test(text)) passed++;

  // Sub-check 3: References tools or actions
  checks++;
  const toolPattern = /\b(?:read|write|search|grep|execute|create|delete|edit|fetch|query|call|invoke|run|open|parse|list)\b/i;
  if (toolPattern.test(text)) passed++;

  // Sub-check 4: Step count in expected range (if specified via expected "min-max")
  if (criterion.expected) {
    checks++;
    const rangeStr = Array.isArray(criterion.expected) ? criterion.expected[0] : criterion.expected;
    const rangeMatch = String(rangeStr).match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const [, minStr, maxStr] = rangeMatch;
      const min = parseInt(minStr, 10);
      const max = parseInt(maxStr, 10);
      // Count step-like lines
      const stepLines = text.match(/(?:^|\n)\s*(?:\d+[.)]\s|[-*]\s)/gm);
      const count = stepLines?.length ?? 0;
      if (count >= min && count <= max) passed++;
    }
  }

  return passed / checks;
}

/**
 * Evaluate collaboration quality for L4 human collaboration tasks.
 *
 * Checks for appropriate collaboration artifacts in the response:
 * - Questions: agent asks clarifying questions (has question marks)
 * - Specificity: questions are concrete, not vague
 * - Options: presents alternatives or trade-offs
 * - Fallbacks: proposes default behavior if clarification unavailable
 *
 * Scores partial credit: each sub-check contributes equally.
 */
function evaluateCollaborationQuality(criterion: Criterion, response: AgentResponse): number {
  const text = response.text || "";
  if (!text.trim()) return 0;

  let checks = 0;
  let passed = 0;

  // Sub-check 1: Asks questions (contains question marks in substantive sentences)
  checks++;
  const questions = text.match(/[^.!?\n]{10,}\?/g);
  if (questions && questions.length > 0) passed++;

  // Sub-check 2: Questions/statements are specific (not vague)
  checks++;
  const specificitySignals = /\b(?:specifically|which|what\s+(?:type|kind|format|version)|how\s+(?:many|much|often)|where\s+(?:exactly|specifically)|do\s+you\s+(?:want|prefer|need|expect)|should\s+(?:I|we|it)|for\s+example)\b/i;
  if (specificitySignals.test(text)) passed++;

  // Sub-check 3: Presents options or trade-offs
  checks++;
  const optionsPattern = /\b(?:option|approach|alternative|trade-?off|pros?\b.*\bcons?\b|advantage|disadvantage|choice|could\s+(?:either|also)|on\s+(?:the\s+)?one\s+hand|versus|vs\.?)\b/i;
  if (optionsPattern.test(text)) passed++;

  // Sub-check 4: Proposes fallback/default behavior
  checks++;
  const fallbackPattern = /\b(?:default|fallback|otherwise|if\s+(?:not|no)\s+(?:specified|provided|clarified)|assume|proceed\s+with|in\s+the\s+(?:absence|meantime)|unless\s+(?:you|otherwise))\b/i;
  if (fallbackPattern.test(text)) passed++;

  return passed / checks;
}
