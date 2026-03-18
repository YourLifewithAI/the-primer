/**
 * AI Tutor Service — Sprint 7
 *
 * Personalized Socratic math tutoring using Claude Haiku 4.5.
 * Guides students to understanding through progressive hints,
 * never giving away answers directly.
 *
 * Safety: math-only, COPPA-compliant, no PII, token-budgeted.
 */

import Anthropic from "@anthropic-ai/sdk";

// ─── Types ────────────────────────────────────────────────────

export interface TutorMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface TutorContext {
  /** The problem prompt text (KaTeX-safe) */
  problemTitle: string;
  problemContext?: string;
  /** Current step prompt */
  stepPrompt: string;
  /** Student's incorrect attempts on this step */
  wrongAttempts: string[];
  /** How many static hints have been revealed */
  hintsRevealed: number;
  /** Total static hints available */
  totalHints: number;
  /** KC name for the current step */
  kcName?: string;
  /** Student's mastery level for this KC (0-1) */
  pMastery?: number;
  /** Total attempts on this KC across all problems */
  totalKcAttempts?: number;
}

export interface TutorRequest {
  studentId: string;
  problemId: string;
  context: TutorContext;
  messages: TutorMessage[];
  newMessage: string;
}

export interface TutorResponse {
  message: string;
  inputTokens: number;
  outputTokens: number;
}

// ─── Constants ────────────────────────────────────────────────

const MAX_MESSAGES_PER_PROBLEM = 10;
const MAX_RESPONSE_TOKENS = 300;
const MODEL = "claude-haiku-4-5-20241022";

// ─── Fallback hint templates (when API unavailable) ──────────

const FALLBACK_HINTS: Record<string, string[]> = {
  nudge: [
    "Take a moment to re-read the problem carefully. What is it asking you to find?",
    "What do you already know from the problem? Try writing down the important numbers.",
    "Can you think of a simpler version of this problem? Try that first!",
  ],
  hint: [
    "Think about what operation (adding, subtracting, multiplying, or dividing) might help here.",
    "Try breaking the problem into smaller steps. What's the first thing you need to figure out?",
    "Look at your answer — does it make sense? Is it too big or too small?",
  ],
  worked: [
    "Let me walk you through a similar example. If you had $3 \\times 4$, you could think of it as $3 + 3 + 3 + 3 = 12$. Now try applying the same idea to your problem!",
  ],
};

/**
 * Gets a fallback hint when the AI service is unavailable.
 * Uses progressive disclosure: nudge -> hint -> worked example.
 */
export function getFallbackHint(messageCount: number): string {
  if (messageCount <= 2) {
    const hints = FALLBACK_HINTS.nudge;
    return hints[Math.floor(Math.random() * hints.length)];
  }
  if (messageCount <= 5) {
    const hints = FALLBACK_HINTS.hint;
    return hints[Math.floor(Math.random() * hints.length)];
  }
  return FALLBACK_HINTS.worked[0];
}

// ─── System prompt ────────────────────────────────────────────

function buildSystemPrompt(ctx: TutorContext): string {
  const masteryDesc =
    ctx.pMastery !== undefined
      ? ctx.pMastery < 0.3
        ? "just starting to learn"
        : ctx.pMastery < 0.6
          ? "building understanding of"
          : ctx.pMastery < 0.95
            ? "getting close to mastering"
            : "reviewing"
      : "working on";

  const kcDesc = ctx.kcName ? `"${ctx.kcName}"` : "this math concept";

  return `You are a warm, encouraging math tutor for a Grade 5 student (ages 10-11). Your name is Primer.

ROLE:
- You help students understand math through the Socratic method
- You NEVER give the answer directly — guide them to discover it
- You ask one question at a time to lead their thinking
- You celebrate effort and progress, not just correct answers

THE STUDENT:
- They are ${masteryDesc} ${kcDesc}
${ctx.totalKcAttempts !== undefined ? `- They have attempted ${ctx.totalKcAttempts} problems on this skill` : ""}
${ctx.wrongAttempts.length > 0 ? `- On this step, they tried: ${ctx.wrongAttempts.join(", ")} (all incorrect)` : ""}
${ctx.hintsRevealed > 0 ? `- They have seen ${ctx.hintsRevealed} of ${ctx.totalHints} available hints` : ""}

CURRENT PROBLEM:
Title: ${ctx.problemTitle}
${ctx.problemContext ? `Context: ${ctx.problemContext}` : ""}
Current step: ${ctx.stepPrompt}

RULES:
1. Use simple, age-appropriate language (5th grade reading level)
2. Keep responses SHORT — 2-3 sentences max, one clear idea at a time
3. Use math notation with $ signs for inline math (e.g., $3 \\times 4 = 12$)
4. NEVER reveal the answer. If the student begs for it, say "I believe you can figure this out! Let me give you another hint."
5. If the student asks about anything other than math, gently redirect: "That's a great question, but let's focus on the math problem — I'm here to help you with that!"
6. NEVER ask for or reference the student's name, age, location, or any personal information
7. Use progressive scaffolding:
   - First: Ask what they understand about the problem
   - Then: Give a conceptual nudge (connect to what they know)
   - Then: Suggest a specific strategy
   - Finally: Walk through a similar example with different numbers
8. Be encouraging but honest. Don't say "great job" when they're wrong — say "good try, let's think about this differently"`;
}

// ─── Client singleton ─────────────────────────────────────────

let _client: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

// ─── Streaming tutor call ─────────────────────────────────────

/**
 * Creates a streaming tutor response. Returns a ReadableStream
 * that yields text chunks, plus a promise that resolves with token counts.
 */
export function createTutorStream(request: TutorRequest): {
  stream: ReadableStream<Uint8Array>;
  tokenCounts: Promise<{ inputTokens: number; outputTokens: number }>;
} | null {
  const client = getClient();
  if (!client) return null;

  // Enforce message limit (count user messages only — assistant messages don't count)
  const userMsgCount = request.messages.filter((m) => m.role === "user").length;
  if (userMsgCount >= MAX_MESSAGES_PER_PROBLEM) {
    const limitMsg =
      "You've used all your tutor messages for this problem. Try using the hints, or move on and come back later — you've got this!";
    const encoder = new TextEncoder();
    return {
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(limitMsg));
          controller.close();
        },
      }),
      tokenCounts: Promise.resolve({ inputTokens: 0, outputTokens: 0 }),
    };
  }

  // Build conversation history for Claude.
  // Drop any leading assistant messages (e.g. the synthetic welcome) —
  // the Anthropic API requires the first message to have role "user".
  const historyMessages = request.messages.filter((m) => m.content.trim() !== "");
  const firstUserIdx = historyMessages.findIndex((m) => m.role === "user");
  const apiHistory = firstUserIdx >= 0 ? historyMessages.slice(firstUserIdx) : [];

  const claudeMessages: Array<{ role: "user" | "assistant"; content: string }> =
    apiHistory.map((m) => ({
      role: m.role,
      content: m.content,
    }));

  // Add the new user message
  claudeMessages.push({ role: "user", content: request.newMessage });

  // Merge consecutive same-role messages (can happen after stream errors)
  const mergedMessages: typeof claudeMessages = [];
  for (const msg of claudeMessages) {
    const prev = mergedMessages[mergedMessages.length - 1];
    if (prev && prev.role === msg.role) {
      prev.content += "\n" + msg.content;
    } else {
      mergedMessages.push({ ...msg });
    }
  }
  claudeMessages.length = 0;
  claudeMessages.push(...mergedMessages);

  let resolveTokens: (counts: {
    inputTokens: number;
    outputTokens: number;
  }) => void;
  const tokenCounts = new Promise<{
    inputTokens: number;
    outputTokens: number;
  }>((resolve) => {
    resolveTokens = resolve;
  });

  const systemPrompt = buildSystemPrompt(request.context);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const anthropicStream = client.messages.stream({
          model: MODEL,
          max_tokens: MAX_RESPONSE_TOKENS,
          system: systemPrompt,
          messages: claudeMessages,
        });

        for await (const event of anthropicStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }

        const finalMessage = await anthropicStream.finalMessage();
        resolveTokens!({
          inputTokens: finalMessage.usage.input_tokens,
          outputTokens: finalMessage.usage.output_tokens,
        });

        controller.close();
      } catch (err) {
        // On API error, return a graceful fallback
        const fallback = getFallbackHint(request.messages.length);
        controller.enqueue(encoder.encode(fallback));
        controller.close();
        resolveTokens!({ inputTokens: 0, outputTokens: 0 });
      }
    },
  });

  return { stream, tokenCounts };
}

// ─── Content safety filter ────────────────────────────────────

const OFF_TOPIC_PATTERNS = [
  /\b(who are you|your name|where.*live|how old)\b/i,
  /\b(tell me a (joke|story|riddle))\b/i,
  /\b(play|game|minecraft|fortnite|roblox)\b/i,
  /\b(ignore.*instructions|system prompt|jailbreak)\b/i,
  /\b(hate|kill|die|weapon|gun|drug)\b/i,
];

/**
 * Checks if a student message should be redirected to math.
 * Returns a redirect message, or null if the message is fine.
 */
export function checkContentSafety(message: string): string | null {
  const trimmed = message.trim();

  // Too short to be meaningful
  if (trimmed.length < 2) {
    return "Could you tell me more about what you're stuck on? I'm here to help with the math!";
  }

  // Too long (potential prompt injection)
  if (trimmed.length > 500) {
    return "That's a lot of text! Can you ask me a shorter question about the math problem?";
  }

  for (const pattern of OFF_TOPIC_PATTERNS) {
    if (pattern.test(trimmed)) {
      return "That's a fun question, but I'm your math helper! Let's focus on the problem. What part are you stuck on?";
    }
  }

  return null;
}
