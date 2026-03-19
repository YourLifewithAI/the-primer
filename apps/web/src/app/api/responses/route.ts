import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bktUpdate, MASTERY_THRESHOLD } from "@primer/shared";
import { auth } from "@clerk/nextjs/server";
import { ensureUser } from "@/lib/ensure-user";
import { createFsrsCard } from "@/lib/fsrs-service";
import { notifyMastery, notifyStruggling } from "@/lib/notifications";

/**
 * POST /api/responses
 *
 * Submit a problem step response. This is the core learning loop:
 * 1. Record the response
 * 2. Run BKT update for each KC on the step
 * 3. Check for mastery transitions
 * 4. Return updated mastery states
 */
export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Look up or create internal user from Clerk ID
  const user = await ensureUser(clerkId);

  const body = await req.json();
  const {
    problemId,
    stepIndex,
    correct,
    responseTimeMs,
    hintsUsed,
    attemptNumber,
    kcIds,
  } = body as {
    problemId: string;
    stepIndex: number;
    correct: boolean;
    responseTimeMs: number;
    hintsUsed: number;
    attemptNumber: number;
    kcIds: string[];
  };

  if (!problemId || stepIndex === undefined || correct === undefined || !kcIds?.length) {
    return NextResponse.json(
      { error: "Missing required fields: problemId, stepIndex, correct, kcIds" },
      { status: 400 }
    );
  }

  // Record the response
  const response = await db.problemResponse.create({
    data: {
      studentId: user.id,
      problemId,
      stepIndex,
      kcId: kcIds[0], // Primary KC
      correct,
      responseTime: responseTimeMs ?? 0,
      hintsUsed: hintsUsed ?? 0,
      attemptNumber: attemptNumber ?? 1,
    },
  });

  // BKT update for each KC on this step
  const masteryUpdates = [];

  for (const kcId of kcIds) {
    // Get or create mastery state
    let mastery = await db.studentMasteryState.findUnique({
      where: { studentId_kcId: { studentId: user.id, kcId } },
    });

    if (!mastery) {
      mastery = await db.studentMasteryState.create({
        data: {
          studentId: user.id,
          kcId,
          pMastery: 0.1,
          pInit: 0.1,
          pTransit: 0.2,
          pSlip: 0.1,
          pGuess: 0.25,
        },
      });
    }

    // Run BKT update
    const result = bktUpdate(
      {
        pMastery: mastery.pMastery,
        pInit: mastery.pInit,
        pTransit: mastery.pTransit,
        pSlip: mastery.pSlip,
        pGuess: mastery.pGuess,
      },
      correct
    );

    // Persist updated mastery
    const updated = await db.studentMasteryState.update({
      where: { id: mastery.id },
      data: {
        pMastery: result.pMastery,
        totalAttempts: { increment: 1 },
        correctCount: correct ? { increment: 1 } : undefined,
        lastAttemptAt: new Date(),
        // Set masteredAt on first mastery transition
        masteredAt:
          result.isMastered && !result.wasMastered ? new Date() : undefined,
      },
    });

    const justMastered = result.isMastered && !result.wasMastered;

    // On mastery transition, create an FSRS card for spaced repetition
    if (justMastered) {
      createFsrsCard(user.id, kcId).catch(() => {
        // Silent fail — don't break the learning flow for FSRS errors
      });
    }

    masteryUpdates.push({
      kcId,
      pMastery: result.pMastery,
      pCorrect: result.pCorrect,
      isMastered: result.isMastered,
      justMastered,
    });
  }

  // Look up KC names for any newly mastered KCs so the frontend can show celebrations
  const newlyMasteredUpdates = masteryUpdates.filter((m) => m.justMastered);
  if (newlyMasteredUpdates.length > 0) {
    const masteredKcIds = newlyMasteredUpdates.map((m) => m.kcId);
    const kcs = await db.knowledgeComponent.findMany({
      where: { id: { in: masteredKcIds } },
      select: { id: true, name: true },
    });
    const nameMap = new Map(kcs.map((kc) => [kc.id, kc.name]));
    for (const update of masteryUpdates) {
      (update as Record<string, unknown>).kcName = nameMap.get(update.kcId) ?? null;
    }
  }

  // Fire notifications asynchronously — never block the response
  const newlyMastered = masteryUpdates.filter((m) => m.justMastered);
  if (newlyMastered.length > 0) {
    // Look up KC names for mastery notifications
    const masteredKcIds = newlyMastered.map((m) => m.kcId);
    db.knowledgeComponent
      .findMany({
        where: { id: { in: masteredKcIds } },
        select: { id: true, name: true },
      })
      .then((kcs) => {
        const nameMap = new Map(kcs.map((kc) => [kc.id, kc.name]));
        for (const m of newlyMastered) {
          const kcName = nameMap.get(m.kcId) ?? "a knowledge component";
          notifyMastery(user.id, user.name, m.kcId, kcName).catch(() => {});
        }
      })
      .catch(() => {});
  }

  // Check if student is now struggling (5+ attempts, <50% accuracy, below threshold)
  // Debounced: max one struggle alert per student per 24 hours.
  // Struggle alerts go to guides/parents (not the student), so we check
  // for any recent STRUGGLE_ALERT whose metadata references this student.
  if (!correct) {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    Promise.all([
      db.studentMasteryState.findMany({
        where: {
          studentId: user.id,
          pMastery: { lt: MASTERY_THRESHOLD },
          totalAttempts: { gte: 5 },
        },
        include: { kc: { select: { name: true } } },
      }),
      db.notification.findFirst({
        where: {
          type: "STRUGGLE_ALERT",
          createdAt: { gte: oneDayAgo },
          metadata: { path: ["studentId"], equals: user.id },
        },
      }),
    ])
      .then(([states, recentAlert]) => {
        if (recentAlert) return; // Already alerted recently
        const struggling = states.filter(
          (s) => s.totalAttempts > 0 && s.correctCount / s.totalAttempts < 0.5
        );
        if (struggling.length >= 2) {
          notifyStruggling(
            user.id,
            user.name,
            struggling.map((s) => s.kc.name)
          ).catch(() => {});
        }
      })
      .catch(() => {});
  }

  return NextResponse.json({
    responseId: response.id,
    masteryUpdates,
  });
}
