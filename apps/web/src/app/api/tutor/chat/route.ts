/**
 * POST /api/tutor/chat — AI tutor conversation endpoint
 *
 * Streams a Socratic tutoring response for a student's math problem.
 * Rate limited to MAX_MESSAGES_PER_PROBLEM per problem session.
 * Logs all interactions for quality review (FERPA audit trail).
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ensureUser } from "@/lib/ensure-user";
import { db } from "@/lib/db";
import {
  createTutorStream,
  checkContentSafety,
  getFallbackHint,
  type TutorMessage,
  type TutorContext,
} from "@/lib/tutor";

const MAX_MESSAGES_PER_PROBLEM = 10;

interface ChatRequestBody {
  problemId: string;
  sessionId?: string;
  context: TutorContext;
  messages: TutorMessage[];
  newMessage: string;
}

export async function POST(req: NextRequest) {
  // ─── Auth ──────────────────────────────────────────────────
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await ensureUser(clerkId);

  // Only students can use the tutor
  if (user.role !== "STUDENT") {
    return NextResponse.json(
      { error: "Tutor is only available for students" },
      { status: 403 }
    );
  }

  // ─── Parse request ────────────────────────────────────────
  let body: ChatRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { problemId, sessionId, context, messages, newMessage } = body;

  if (!problemId || !context || !newMessage) {
    return NextResponse.json(
      { error: "Missing required fields: problemId, context, newMessage" },
      { status: 400 }
    );
  }

  // ─── Rate limit: max messages per problem ─────────────────
  const userMessageCount = messages.filter((m: TutorMessage) => m.role === "user").length;
  if (userMessageCount >= MAX_MESSAGES_PER_PROBLEM) {
    return NextResponse.json(
      {
        error: "Message limit reached",
        message:
          "You've used all your tutor messages for this problem. Try the hints, or come back to it later!",
      },
      { status: 429 }
    );
  }

  // ─── Content safety ───────────────────────────────────────
  const safetyRedirect = checkContentSafety(newMessage);
  if (safetyRedirect) {
    // Return the redirect as a non-streaming response (no tokens used)
    return NextResponse.json({
      message: safetyRedirect,
      sessionId: sessionId ?? null,
      inputTokens: 0,
      outputTokens: 0,
      filtered: true,
    });
  }

  // ─── Get or create tutor session ──────────────────────────
  let session: { id: string };

  if (sessionId) {
    // Verify session exists and belongs to this student
    const existing = await db.tutorSession.findFirst({
      where: { id: sessionId, studentId: user.id, problemId },
      select: { id: true },
    });
    session = existing ?? (await createSession(user.id, problemId));
  } else {
    session = await createSession(user.id, problemId);
  }

  // ─── Call AI tutor ────────────────────────────────────────
  const result = createTutorStream({
    studentId: user.id,
    problemId,
    context,
    messages,
    newMessage,
  });

  // If AI unavailable, return fallback hint
  if (!result) {
    const fallback = getFallbackHint(messages.length);

    // Log the fallback interaction
    await logMessages(session.id, user.id, messages, newMessage, fallback, 0, 0);

    return NextResponse.json({
      message: fallback,
      sessionId: session.id,
      inputTokens: 0,
      outputTokens: 0,
      fallback: true,
    });
  }

  // ─── Stream response ──────────────────────────────────────
  const { stream, tokenCounts } = result;

  // Collect the full response text for logging (tap the stream)
  let fullResponse = "";
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  const loggingStream = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      fullResponse += decoder.decode(chunk, { stream: true });
      controller.enqueue(chunk);
    },
    async flush() {
      // Log after stream completes
      try {
        const tokens = await tokenCounts;
        await logMessages(
          session.id,
          user.id,
          messages,
          newMessage,
          fullResponse,
          tokens.inputTokens,
          tokens.outputTokens
        );
      } catch {
        // Don't fail the response if logging fails
      }
    },
  });

  const responseStream = stream.pipeThrough(loggingStream);

  return new Response(responseStream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Tutor-Session-Id": session.id,
    },
  });
}

// ─── Helpers ──────────────────────────────────────────────────

async function createSession(studentId: string, problemId: string) {
  return db.tutorSession.create({
    data: {
      studentId,
      problemId,
      model: process.env.ANTHROPIC_API_KEY ? "claude-haiku-4.5" : "fallback",
      messages: [],
    },
    select: { id: true },
  });
}

async function logMessages(
  sessionId: string,
  studentId: string,
  existingMessages: TutorMessage[],
  newUserMessage: string,
  assistantResponse: string,
  inputTokens: number,
  outputTokens: number
) {
  const allMessages = [
    ...existingMessages,
    { role: "user" as const, content: newUserMessage, timestamp: Date.now() },
    {
      role: "assistant" as const,
      content: assistantResponse,
      timestamp: Date.now(),
    },
  ];

  await db.tutorSession.update({
    where: { id: sessionId },
    data: {
      messages: allMessages as unknown as import("@prisma/client").Prisma.InputJsonValue,
      inputTokens: { increment: inputTokens },
      outputTokens: { increment: outputTokens },
    },
  });
}
