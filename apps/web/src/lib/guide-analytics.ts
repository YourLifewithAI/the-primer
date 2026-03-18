/**
 * Analytics queries for the Guide Dashboard.
 *
 * Provides classroom-level and student-level data aggregations
 * for guides to monitor student progress and identify who needs help.
 */

import { db } from "@/lib/db";
import { MASTERY_THRESHOLD } from "@primer/shared";

// ─── Types ──────────────────────────────────────────────────

export interface StudentSummary {
  studentId: string;
  studentName: string | null;
  totalKCs: number;
  masteredKCs: number;
  averageMastery: number;
  totalAttempts: number;
  totalCorrect: number;
  accuracy: number;
  lastActiveAt: Date | null;
  /** Number of KCs where the student has 3+ consecutive failures */
  strugglingKCs: number;
  status: "active" | "idle" | "struggling" | "on_track" | "completed";
}

export interface ClassroomAnalytics {
  classroomId: string;
  classroomName: string;
  studentCount: number;
  students: StudentSummary[];
  kcHeatmap: KCHeatmapEntry[];
  averageClassMastery: number;
  strugglingCount: number;
  idleCount: number;
}

export interface KCHeatmapEntry {
  kcId: string;
  kcName: string;
  /** Average mastery across all students in the classroom */
  averageMastery: number;
  /** How many students have mastered this KC */
  masteredCount: number;
  /** How many students have attempted this KC */
  attemptedCount: number;
  /** Total students in classroom */
  totalStudents: number;
  /** Low mastery + high attempts = struggling indicator */
  isStrugglingTopic: boolean;
}

export interface StudentDetail {
  studentId: string;
  studentName: string | null;
  email: string;
  gradeLevel: number | null;
  enrolledAt: Date | null;
  masteryStates: {
    kcId: string;
    kcName: string;
    pMastery: number;
    isMastered: boolean;
    totalAttempts: number;
    correctCount: number;
    accuracy: number;
    lastAttemptAt: Date | null;
    masteredAt: Date | null;
  }[];
  recentResponses: {
    id: string;
    problemTitle: string;
    correct: boolean;
    createdAt: Date;
    responseTime: number;
    hintsUsed: number;
  }[];
  summary: {
    totalKCs: number;
    masteredKCs: number;
    averageMastery: number;
    totalAttempts: number;
    accuracy: number;
    averageResponseTime: number;
    averageHintsUsed: number;
  };
}

// ─── Queries ────────────────────────────────────────────────

/**
 * Get analytics for a classroom including all student summaries and KC heatmap.
 */
export async function getClassroomAnalytics(
  classroomId: string
): Promise<ClassroomAnalytics> {
  const classroom = await db.classroom.findUniqueOrThrow({
    where: { id: classroomId },
    include: {
      members: {
        include: {
          student: {
            select: { id: true, name: true },
          },
        },
      },
    },
  });

  const studentIds = classroom.members.map((m) => m.student.id);

  // Get all mastery states for classroom students
  const allMasteryStates = await db.studentMasteryState.findMany({
    where: { studentId: { in: studentIds } },
    include: {
      kc: { select: { id: true, name: true } },
    },
  });

  // Get recent responses (last 24h) to determine active/idle status
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentResponses = await db.problemResponse.findMany({
    where: {
      studentId: { in: studentIds },
      createdAt: { gte: oneDayAgo },
    },
    select: { studentId: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  const lastActiveMap = new Map<string, Date>();
  for (const r of recentResponses) {
    if (!lastActiveMap.has(r.studentId)) {
      lastActiveMap.set(r.studentId, r.createdAt);
    }
  }

  // Also get overall last activity for students not active in 24h
  const allLastResponses = await db.problemResponse.groupBy({
    by: ["studentId"],
    where: { studentId: { in: studentIds } },
    _max: { createdAt: true },
  });
  for (const r of allLastResponses) {
    if (!lastActiveMap.has(r.studentId) && r._max.createdAt) {
      lastActiveMap.set(r.studentId, r._max.createdAt);
    }
  }

  // Build per-student summaries
  const students: StudentSummary[] = classroom.members.map((member) => {
    const studentStates = allMasteryStates.filter(
      (ms) => ms.studentId === member.student.id
    );
    const totalKCs = studentStates.length;
    const masteredKCs = studentStates.filter(
      (ms) => ms.pMastery >= MASTERY_THRESHOLD
    ).length;
    const averageMastery =
      totalKCs > 0
        ? studentStates.reduce((sum, ms) => sum + ms.pMastery, 0) / totalKCs
        : 0;
    const totalAttempts = studentStates.reduce(
      (sum, ms) => sum + ms.totalAttempts,
      0
    );
    const totalCorrect = studentStates.reduce(
      (sum, ms) => sum + ms.correctCount,
      0
    );
    const accuracy = totalAttempts > 0 ? totalCorrect / totalAttempts : 0;
    const lastActiveAt = lastActiveMap.get(member.student.id) ?? null;

    // Count KCs where student has low mastery but high attempts (struggling)
    const strugglingKCs = studentStates.filter(
      (ms) =>
        ms.pMastery < MASTERY_THRESHOLD &&
        ms.totalAttempts >= 5 &&
        ms.correctCount / ms.totalAttempts < 0.5
    ).length;

    // Determine status
    let status: StudentSummary["status"] = "on_track";
    if (totalKCs === 0) {
      status = "idle";
    } else if (strugglingKCs >= 2) {
      status = "struggling";
    } else if (!lastActiveAt || Date.now() - lastActiveAt.getTime() > 3 * 24 * 60 * 60 * 1000) {
      status = "idle";
    } else if (masteredKCs === totalKCs && totalKCs > 0) {
      status = "completed";
    } else {
      status = lastActiveAt && Date.now() - lastActiveAt.getTime() < 24 * 60 * 60 * 1000
        ? "active"
        : "on_track";
    }

    return {
      studentId: member.student.id,
      studentName: member.student.name,
      totalKCs,
      masteredKCs,
      averageMastery,
      totalAttempts,
      totalCorrect,
      accuracy,
      lastActiveAt,
      strugglingKCs,
      status,
    };
  });

  // Build KC heatmap
  const kcMap = new Map<string, { name: string; masteries: number[]; attemptedCount: number }>();
  for (const ms of allMasteryStates) {
    const entry = kcMap.get(ms.kcId) ?? {
      name: ms.kc.name,
      masteries: [],
      attemptedCount: 0,
    };
    entry.masteries.push(ms.pMastery);
    if (ms.totalAttempts > 0) entry.attemptedCount++;
    kcMap.set(ms.kcId, entry);
  }

  const kcHeatmap: KCHeatmapEntry[] = [...kcMap.entries()].map(
    ([kcId, data]) => {
      const avgMastery =
        data.masteries.length > 0
          ? data.masteries.reduce((s, m) => s + m, 0) / data.masteries.length
          : 0;
      const masteredCount = data.masteries.filter(
        (m) => m >= MASTERY_THRESHOLD
      ).length;
      // Struggling topic: average mastery < 0.5 and at least 3 students attempted
      const isStrugglingTopic = avgMastery < 0.5 && data.attemptedCount >= 3;

      return {
        kcId,
        kcName: data.name,
        averageMastery: avgMastery,
        masteredCount,
        attemptedCount: data.attemptedCount,
        totalStudents: studentIds.length,
        isStrugglingTopic,
      };
    }
  );

  // Sort heatmap: struggling topics first, then by lowest mastery
  kcHeatmap.sort((a, b) => {
    if (a.isStrugglingTopic !== b.isStrugglingTopic) {
      return a.isStrugglingTopic ? -1 : 1;
    }
    return a.averageMastery - b.averageMastery;
  });

  const averageClassMastery =
    students.length > 0
      ? students.reduce((sum, s) => sum + s.averageMastery, 0) / students.length
      : 0;

  return {
    classroomId,
    classroomName: classroom.name,
    studentCount: students.length,
    students,
    kcHeatmap,
    averageClassMastery,
    strugglingCount: students.filter((s) => s.status === "struggling").length,
    idleCount: students.filter((s) => s.status === "idle").length,
  };
}

/**
 * Get detailed progress data for a specific student.
 */
export async function getStudentDetail(
  studentId: string
): Promise<StudentDetail> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: studentId },
    include: {
      studentProfile: { select: { gradeLevel: true } },
      masteryStates: {
        include: {
          kc: { select: { id: true, name: true } },
        },
        orderBy: { updatedAt: "desc" },
      },
      responses: {
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          problem: { select: { title: true } },
        },
      },
      enrollments: {
        take: 1,
        orderBy: { enrolledAt: "asc" },
      },
    },
  });

  const masteryStates = user.masteryStates.map((ms) => ({
    kcId: ms.kcId,
    kcName: ms.kc.name,
    pMastery: ms.pMastery,
    isMastered: ms.pMastery >= MASTERY_THRESHOLD,
    totalAttempts: ms.totalAttempts,
    correctCount: ms.correctCount,
    accuracy: ms.totalAttempts > 0 ? ms.correctCount / ms.totalAttempts : 0,
    lastAttemptAt: ms.lastAttemptAt,
    masteredAt: ms.masteredAt,
  }));

  const recentResponses = user.responses.map((r) => ({
    id: r.id,
    problemTitle: r.problem.title,
    correct: r.correct,
    createdAt: r.createdAt,
    responseTime: r.responseTime,
    hintsUsed: r.hintsUsed,
  }));

  const totalKCs = masteryStates.length;
  const masteredKCs = masteryStates.filter((ms) => ms.isMastered).length;
  const totalAttempts = masteryStates.reduce(
    (sum, ms) => sum + ms.totalAttempts,
    0
  );
  const totalCorrect = masteryStates.reduce(
    (sum, ms) => sum + ms.correctCount,
    0
  );
  const avgResponseTime =
    recentResponses.length > 0
      ? recentResponses.reduce((sum, r) => sum + r.responseTime, 0) /
        recentResponses.length
      : 0;
  const avgHints =
    recentResponses.length > 0
      ? recentResponses.reduce((sum, r) => sum + r.hintsUsed, 0) /
        recentResponses.length
      : 0;

  return {
    studentId: user.id,
    studentName: user.name,
    email: user.email,
    gradeLevel: user.studentProfile?.gradeLevel ?? null,
    enrolledAt: user.enrollments[0]?.enrolledAt ?? null,
    masteryStates,
    recentResponses,
    summary: {
      totalKCs,
      masteredKCs,
      averageMastery:
        totalKCs > 0
          ? masteryStates.reduce((sum, ms) => sum + ms.pMastery, 0) / totalKCs
          : 0,
      totalAttempts,
      accuracy: totalAttempts > 0 ? totalCorrect / totalAttempts : 0,
      averageResponseTime: avgResponseTime,
      averageHintsUsed: avgHints,
    },
  };
}

/**
 * Get all classrooms for a guide with basic stats.
 */
export async function getGuideClassrooms(guideProfileId: string) {
  const classrooms = await db.classroom.findMany({
    where: { guideId: guideProfileId, archived: false },
    include: {
      course: { select: { id: true, title: true } },
      _count: { select: { members: true, assignments: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return classrooms.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    courseTitle: c.course?.title ?? null,
    courseId: c.courseId,
    joinCode: c.joinCode,
    studentCount: c._count.members,
    assignmentCount: c._count.assignments,
    createdAt: c.createdAt,
  }));
}
