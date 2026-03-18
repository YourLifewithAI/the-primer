/**
 * Analytics queries for the Admin Dashboard.
 *
 * Platform-wide statistics, user management data, content moderation,
 * and deep analytics for admin users.
 */

import { db } from "@/lib/db";
import { MASTERY_THRESHOLD } from "@primer/shared";
import { UserRole, Subject } from "@prisma/client";

// ─── Types ──────────────────────────────────────────────────

export interface PlatformStats {
  users: {
    total: number;
    students: number;
    guides: number;
    parents: number;
    admins: number;
  };
  activeUsers: {
    daily: number;
    weekly: number;
    monthly: number;
  };
  content: {
    courses: number;
    lessons: number;
    problems: number;
    knowledgeComponents: number;
  };
  learning: {
    totalResponses: number;
    totalMasteryTransitions: number;
    averageAccuracy: number;
  };
  tutor: {
    totalSessions: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    estimatedCost: number;
  };
  recentSignups: {
    id: string;
    name: string | null;
    email: string;
    role: UserRole;
    createdAt: Date;
  }[];
}

export interface UserListItem {
  id: string;
  clerkId: string;
  name: string | null;
  email: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
  _count: {
    responses: number;
    tutorSessions: number;
    enrollments: number;
  };
}

export interface UserDetail {
  id: string;
  clerkId: string;
  name: string | null;
  email: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
  responseCount: number;
  tutorSessionCount: number;
  enrollmentCount: number;
  masteryCount: number;
  masteredCount: number;
  lastActiveAt: Date | null;
}

export interface ContentListItem {
  id: string;
  title: string;
  type: "course" | "lesson";
  subject: Subject | null;
  published: boolean;
  authorName: string | null;
  authorEmail: string | null;
  createdAt: Date;
  updatedAt: Date;
  studentCount: number;
  flagged: boolean;
  status: "published" | "draft" | "archived" | "flagged";
}

export interface PlatformAnalyticsData {
  masteryByGradeSubject: {
    gradeLevel: number;
    subject: Subject;
    averageMastery: number;
    studentCount: number;
    masteredCount: number;
    totalKCs: number;
  }[];
  engagementTrend: {
    date: string;
    activeUsers: number;
    totalResponses: number;
    avgActiveMinutes: number;
  }[];
  tutorUsage: {
    date: string;
    sessions: number;
    totalMessages: number;
    inputTokens: number;
    outputTokens: number;
    estimatedCost: number;
  }[];
  topCourses: {
    id: string;
    title: string;
    subject: Subject;
    enrollmentCount: number;
    completionRate: number;
  }[];
  leastUsedCourses: {
    id: string;
    title: string;
    subject: Subject;
    enrollmentCount: number;
  }[];
}

// Haiku pricing per million tokens (as of 2025)
const HAIKU_INPUT_COST_PER_MILLION = 0.80;
const HAIKU_OUTPUT_COST_PER_MILLION = 4.00;

function estimateCost(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1_000_000) * HAIKU_INPUT_COST_PER_MILLION +
    (outputTokens / 1_000_000) * HAIKU_OUTPUT_COST_PER_MILLION
  );
}

// ─── Platform Overview ──────────────────────────────────────

export async function getPlatformStats(): Promise<PlatformStats> {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // User counts by role
  const userCounts = await db.user.groupBy({
    by: ["role"],
    _count: { id: true },
  });

  const roleCounts: Record<string, number> = {};
  for (const entry of userCounts) {
    roleCounts[entry.role] = entry._count.id;
  }

  const totalUsers = Object.values(roleCounts).reduce((a, b) => a + b, 0);

  // Active users (based on problem responses)
  const [dailyActive, weeklyActive, monthlyActive] = await Promise.all([
    db.problemResponse.groupBy({
      by: ["studentId"],
      where: { createdAt: { gte: oneDayAgo } },
    }),
    db.problemResponse.groupBy({
      by: ["studentId"],
      where: { createdAt: { gte: oneWeekAgo } },
    }),
    db.problemResponse.groupBy({
      by: ["studentId"],
      where: { createdAt: { gte: oneMonthAgo } },
    }),
  ]);

  // Content counts
  const [courseCount, lessonCount, problemCount, kcCount] = await Promise.all([
    db.course.count(),
    db.lesson.count(),
    db.problem.count(),
    db.knowledgeComponent.count(),
  ]);

  // Learning stats
  const [totalResponses, masteryTransitions] = await Promise.all([
    db.problemResponse.count(),
    db.studentMasteryState.count({
      where: { masteredAt: { not: null } },
    }),
  ]);

  // Calculate accuracy manually
  const correctCount = await db.problemResponse.count({
    where: { correct: true },
  });
  const averageAccuracy = totalResponses > 0 ? correctCount / totalResponses : 0;

  // Tutor stats
  const tutorAgg = await db.tutorSession.aggregate({
    _count: { id: true },
    _sum: {
      inputTokens: true,
      outputTokens: true,
    },
  });

  const totalInputTokens = tutorAgg._sum.inputTokens ?? 0;
  const totalOutputTokens = tutorAgg._sum.outputTokens ?? 0;

  // Recent signups
  const recentSignups = await db.user.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
    },
  });

  return {
    users: {
      total: totalUsers,
      students: roleCounts["STUDENT"] ?? 0,
      guides: roleCounts["GUIDE"] ?? 0,
      parents: roleCounts["PARENT"] ?? 0,
      admins: roleCounts["ADMIN"] ?? 0,
    },
    activeUsers: {
      daily: dailyActive.length,
      weekly: weeklyActive.length,
      monthly: monthlyActive.length,
    },
    content: {
      courses: courseCount,
      lessons: lessonCount,
      problems: problemCount,
      knowledgeComponents: kcCount,
    },
    learning: {
      totalResponses,
      totalMasteryTransitions: masteryTransitions,
      averageAccuracy,
    },
    tutor: {
      totalSessions: tutorAgg._count.id,
      totalInputTokens,
      totalOutputTokens,
      estimatedCost: estimateCost(totalInputTokens, totalOutputTokens),
    },
    recentSignups,
  };
}

// ─── User Management ────────────────────────────────────────

export async function getUsers(options: {
  search?: string;
  role?: UserRole;
  page?: number;
  pageSize?: number;
}): Promise<{ users: UserListItem[]; total: number }> {
  const { search, role, page = 1, pageSize = 25 } = options;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};

  if (role) {
    Object.assign(where, { role });
  }

  if (search) {
    Object.assign(where, {
      OR: [
        { name: { contains: search, mode: "insensitive" as const } },
        { email: { contains: search, mode: "insensitive" as const } },
      ],
    });
  }

  const [users, total] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        _count: {
          select: {
            responses: true,
            tutorSessions: true,
            enrollments: true,
          },
        },
      },
    }),
    db.user.count({ where }),
  ]);

  return {
    users: users.map((u) => ({
      id: u.id,
      clerkId: u.clerkId,
      name: u.name,
      email: u.email,
      role: u.role,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
      _count: u._count,
    })),
    total,
  };
}

export async function getUserDetail(userId: string): Promise<UserDetail> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      _count: {
        select: {
          responses: true,
          tutorSessions: true,
          enrollments: true,
          masteryStates: true,
        },
      },
    },
  });

  const masteredCount = await db.studentMasteryState.count({
    where: {
      studentId: userId,
      pMastery: { gte: MASTERY_THRESHOLD },
    },
  });

  const lastResponse = await db.problemResponse.findFirst({
    where: { studentId: userId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  return {
    id: user.id,
    clerkId: user.clerkId,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    responseCount: user._count.responses,
    tutorSessionCount: user._count.tutorSessions,
    enrollmentCount: user._count.enrollments,
    masteryCount: user._count.masteryStates,
    masteredCount,
    lastActiveAt: lastResponse?.createdAt ?? null,
  };
}

// ─── Content Moderation ─────────────────────────────────────

export async function getContentList(options: {
  search?: string;
  type?: "course" | "lesson";
  page?: number;
  pageSize?: number;
}): Promise<{ items: ContentListItem[]; total: number }> {
  const { search, type, page = 1, pageSize = 25 } = options;
  const items: ContentListItem[] = [];
  let total = 0;

  const shouldIncludeCourses = !type || type === "course";
  const shouldIncludeLessons = !type || type === "lesson";

  if (shouldIncludeCourses) {
    const courseWhere: Record<string, unknown> = {};
    if (search) {
      courseWhere.title = { contains: search, mode: "insensitive" };
    }

    const [courses, courseCount] = await Promise.all([
      db.course.findMany({
        where: courseWhere,
        orderBy: { createdAt: "desc" },
        take: type === "course" ? pageSize : Math.floor(pageSize / 2),
        skip: type === "course" ? (page - 1) * pageSize : 0,
        include: {
          author: {
            include: {
              user: { select: { name: true, email: true } },
            },
          },
          _count: { select: { enrollments: true } },
        },
      }),
      db.course.count({ where: courseWhere }),
    ]);

    for (const c of courses) {
      items.push({
        id: c.id,
        title: c.title,
        type: "course",
        subject: c.subject,
        published: c.published,
        authorName: c.author?.user.name ?? null,
        authorEmail: c.author?.user.email ?? null,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        studentCount: c._count.enrollments,
        flagged: false, // Courses don't have a flag field yet; we use a convention
        status: c.published ? "published" : "draft",
      });
    }
    total += courseCount;
  }

  if (shouldIncludeLessons) {
    const lessonWhere: Record<string, unknown> = {};
    if (search) {
      lessonWhere.title = { contains: search, mode: "insensitive" };
    }

    const [lessons, lessonCount] = await Promise.all([
      db.lesson.findMany({
        where: lessonWhere,
        orderBy: { createdAt: "desc" },
        take: type === "lesson" ? pageSize : Math.floor(pageSize / 2),
        skip: type === "lesson" ? (page - 1) * pageSize : 0,
        include: {
          author: {
            include: {
              user: { select: { name: true, email: true } },
            },
          },
          module: {
            include: {
              course: { select: { id: true, title: true, subject: true } },
            },
          },
        },
      }),
      db.lesson.count({ where: lessonWhere }),
    ]);

    for (const l of lessons) {
      items.push({
        id: l.id,
        title: l.title,
        type: "lesson",
        subject: l.module.course.subject,
        published: l.status === "PUBLISHED",
        authorName: l.author?.user.name ?? null,
        authorEmail: l.author?.user.email ?? null,
        createdAt: l.createdAt,
        updatedAt: l.updatedAt,
        studentCount: 0, // Lessons don't have direct enrollment count
        flagged: l.status === "ARCHIVED", // Use ARCHIVED as a proxy for flagged
        status: l.status === "PUBLISHED" ? "published" : l.status === "DRAFT" ? "draft" : "archived",
      });
    }
    total += lessonCount;
  }

  // Sort by createdAt descending
  items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return { items, total };
}

// ─── Platform Analytics ─────────────────────────────────────

export async function getPlatformAnalytics(): Promise<PlatformAnalyticsData> {
  // Mastery by grade/subject
  const masteryStates = await db.studentMasteryState.findMany({
    include: {
      student: {
        include: {
          studentProfile: { select: { gradeLevel: true } },
        },
      },
      kc: { select: { subject: true } },
    },
  });

  const gradeSubjectMap = new Map<
    string,
    { masteries: number[]; students: Set<string>; mastered: number; totalKCs: number }
  >();

  for (const ms of masteryStates) {
    const grade = ms.student.studentProfile?.gradeLevel ?? 0;
    const subject = ms.kc.subject;
    const key = `${grade}-${subject}`;
    const entry = gradeSubjectMap.get(key) ?? {
      masteries: [],
      students: new Set<string>(),
      mastered: 0,
      totalKCs: 0,
    };
    entry.masteries.push(ms.pMastery);
    entry.students.add(ms.studentId);
    if (ms.pMastery >= MASTERY_THRESHOLD) entry.mastered++;
    entry.totalKCs++;
    gradeSubjectMap.set(key, entry);
  }

  const masteryByGradeSubject = [...gradeSubjectMap.entries()].map(([key, data]) => {
    const [gradeStr, subject] = key.split("-");
    return {
      gradeLevel: parseInt(gradeStr, 10),
      subject: subject as Subject,
      averageMastery:
        data.masteries.length > 0
          ? data.masteries.reduce((a, b) => a + b, 0) / data.masteries.length
          : 0,
      studentCount: data.students.size,
      masteredCount: data.mastered,
      totalKCs: data.totalKCs,
    };
  });

  // Engagement trend (last 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const engagementAggs = await db.engagementAggregate.findMany({
    where: { date: { gte: thirtyDaysAgo } },
  });

  const engagementByDate = new Map<
    string,
    { users: Set<string>; responses: number; activeMinutes: number; count: number }
  >();

  for (const agg of engagementAggs) {
    const dateStr = agg.date.toISOString().split("T")[0];
    const entry = engagementByDate.get(dateStr) ?? {
      users: new Set<string>(),
      responses: 0,
      activeMinutes: 0,
      count: 0,
    };
    entry.users.add(agg.studentId);
    entry.responses += agg.problemsAttempted;
    entry.activeMinutes += agg.activeMinutes;
    entry.count++;
    engagementByDate.set(dateStr, entry);
  }

  const engagementTrend = [...engagementByDate.entries()]
    .map(([date, data]) => ({
      date,
      activeUsers: data.users.size,
      totalResponses: data.responses,
      avgActiveMinutes: data.count > 0 ? data.activeMinutes / data.count : 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Tutor usage trend (last 30 days)
  const tutorSessions = await db.tutorSession.findMany({
    where: { startedAt: { gte: thirtyDaysAgo } },
    select: {
      startedAt: true,
      messages: true,
      inputTokens: true,
      outputTokens: true,
    },
  });

  const tutorByDate = new Map<
    string,
    { sessions: number; messages: number; inputTokens: number; outputTokens: number }
  >();

  for (const session of tutorSessions) {
    const dateStr = session.startedAt.toISOString().split("T")[0];
    const entry = tutorByDate.get(dateStr) ?? {
      sessions: 0,
      messages: 0,
      inputTokens: 0,
      outputTokens: 0,
    };
    entry.sessions++;
    // messages is a Json field — count array length if it's an array
    const msgs = session.messages;
    if (Array.isArray(msgs)) {
      entry.messages += msgs.length;
    }
    entry.inputTokens += session.inputTokens;
    entry.outputTokens += session.outputTokens;
    tutorByDate.set(dateStr, entry);
  }

  const tutorUsage = [...tutorByDate.entries()]
    .map(([date, data]) => ({
      date,
      sessions: data.sessions,
      totalMessages: data.messages,
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
      estimatedCost: estimateCost(data.inputTokens, data.outputTokens),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Top courses by enrollment
  const courses = await db.course.findMany({
    where: { published: true },
    include: {
      _count: { select: { enrollments: true } },
    },
    orderBy: { enrollments: { _count: "desc" } },
  });

  const topCourses = courses.slice(0, 10).map((c) => ({
    id: c.id,
    title: c.title,
    subject: c.subject,
    enrollmentCount: c._count.enrollments,
    completionRate: 0, // Would need more complex query; placeholder
  }));

  const leastUsedCourses = courses
    .filter((c) => c._count.enrollments === 0)
    .slice(0, 10)
    .map((c) => ({
      id: c.id,
      title: c.title,
      subject: c.subject,
      enrollmentCount: c._count.enrollments,
    }));

  return {
    masteryByGradeSubject,
    engagementTrend,
    tutorUsage,
    topCourses,
    leastUsedCourses,
  };
}

// ─── Audit Log ──────────────────────────────────────────────

export async function getAuditLogs(options: {
  userId?: string;
  action?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  pageSize?: number;
}): Promise<{
  logs: {
    id: string;
    userId: string;
    studentId: string;
    action: string;
    details: unknown;
    ipAddress: string | null;
    createdAt: Date;
  }[];
  total: number;
}> {
  const { userId, action, startDate, endDate, page = 1, pageSize = 50 } = options;

  const where: Record<string, unknown> = {};
  if (userId) where.userId = userId;
  if (action) where.action = action;
  if (startDate || endDate) {
    const dateFilter: Record<string, Date> = {};
    if (startDate) dateFilter.gte = startDate;
    if (endDate) dateFilter.lte = endDate;
    where.createdAt = dateFilter;
  }

  const [logs, total] = await Promise.all([
    db.dataAccessLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.dataAccessLog.count({ where }),
  ]);

  return { logs, total };
}
