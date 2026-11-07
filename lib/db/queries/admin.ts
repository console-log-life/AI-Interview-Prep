import "server-only";
import type { Prisma, Role } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

/**
 * Admin analytics.
 *
 * Everything here is aggregate. No route in this module returns another user's
 * resume text, interview transcript or answers — admins get counts and
 * averages, not private practice content.
 */
export async function getPlatformStats() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000);

  const [
    totalUsers,
    newUsers30d,
    activeUsers7d,
    interviewsCompleted,
    assessmentsCompleted,
    codingSubmissions,
    totalQuestions,
    totalAssessments,
    totalProblems,
    interviewAvg,
    assessmentAvg,
    resumesAnalyzed,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    prisma.practiceActivity
      .findMany({
        where: { day: { gte: sevenDaysAgo } },
        select: { userId: true },
        distinct: ["userId"],
      })
      .then((rows) => rows.length),
    prisma.interview.count({ where: { status: "COMPLETED" } }),
    prisma.assessmentAttempt.count({ where: { status: "SUBMITTED" } }),
    prisma.codingSubmission.count({ where: { isRunOnly: false } }),
    prisma.question.count({ where: { isActive: true } }),
    prisma.assessment.count({ where: { isPublished: true } }),
    prisma.codingProblem.count({ where: { isPublished: true } }),
    prisma.interviewReport.aggregate({ _avg: { overallScore: true } }),
    prisma.assessmentAttempt.aggregate({
      where: { status: "SUBMITTED" },
      _avg: { percentage: true },
    }),
    prisma.resume.count({ where: { status: "ANALYZED" } }),
  ]);

  return {
    totalUsers,
    newUsers30d,
    activeUsers7d,
    interviewsCompleted,
    assessmentsCompleted,
    codingSubmissions,
    totalQuestions,
    totalAssessments,
    totalProblems,
    resumesAnalyzed,
    averageInterviewScore: Math.round(interviewAvg._avg.overallScore ?? 0),
    averageAssessmentScore: Math.round(assessmentAvg._avg.percentage ?? 0),
  };
}

/** Most-attempted categories, from real attempts. */
export async function getPopularCategories(limit = 8) {
  const rows = await prisma.assessmentAttempt.groupBy({
    by: ["assessmentId"],
    where: { status: "SUBMITTED" },
    _count: { _all: true },
    _avg: { percentage: true },
  });

  if (rows.length === 0) return [];

  const assessments = await prisma.assessment.findMany({
    where: { id: { in: rows.map((row) => row.assessmentId) } },
    select: { id: true, category: true },
  });
  const categoryOf = new Map(assessments.map((a) => [a.id, a.category]));

  const buckets = new Map<string, { attempts: number; scoreSum: number }>();
  for (const row of rows) {
    const category = categoryOf.get(row.assessmentId);
    if (!category) continue;
    const bucket = buckets.get(category) ?? { attempts: 0, scoreSum: 0 };
    bucket.attempts += row._count._all;
    bucket.scoreSum += (row._avg.percentage ?? 0) * row._count._all;
    buckets.set(category, bucket);
  }

  return [...buckets.entries()]
    .map(([category, bucket]) => ({
      category,
      attempts: bucket.attempts,
      averageScore:
        bucket.attempts > 0 ? Math.round(bucket.scoreSum / bucket.attempts) : 0,
    }))
    .sort((a, b) => b.attempts - a.attempts)
    .slice(0, limit);
}

/** Most-practised target roles, from real interviews. */
export async function getPopularRoles(limit = 8) {
  const rows = await prisma.interview.groupBy({
    by: ["targetRole"],
    _count: { _all: true },
    orderBy: { _count: { targetRole: "desc" } },
    take: limit,
  });
  return rows.map((row) => ({
    role: row.targetRole,
    count: row._count._all,
  }));
}

export async function listUsers(filters: {
  search?: string;
  role?: Role;
  page?: number;
  pageSize?: number;
}) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 25));

  const where: Prisma.UserWhereInput = {
    ...(filters.role ? { role: filters.role } : {}),
    ...(filters.search
      ? {
          OR: [
            { email: { contains: filters.search, mode: "insensitive" } },
            { name: { contains: filters.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        lastLoginAt: true,
        profile: { select: { targetRole: true, college: true } },
        _count: {
          select: {
            interviews: true,
            assessmentAttempts: true,
            codingSubmissions: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/**
 * Interview activity for moderation.
 * Metadata only — transcripts are never included.
 */
export async function listInterviewActivity(filters: {
  page?: number;
  pageSize?: number;
}) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 25));

  const [items, total] = await Promise.all([
    prisma.interview.findMany({
      select: {
        id: true,
        targetRole: true,
        type: true,
        persona: true,
        difficulty: true,
        status: true,
        createdAt: true,
        completedAt: true,
        user: { select: { email: true, name: true } },
        report: { select: { overallScore: true } },
        _count: { select: { messages: true, evaluations: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.interview.count(),
  ]);

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** Signups per day over the given window — powers the growth chart. */
export async function getSignupTrend(days = 30) {
  const since = new Date(Date.now() - days * 86_400_000);
  const users = await prisma.user.findMany({
    where: { createdAt: { gte: since } },
    select: { createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const buckets = new Map<string, number>();
  for (let index = 0; index < days; index += 1) {
    const day = new Date(since.getTime() + index * 86_400_000);
    buckets.set(day.toISOString().slice(0, 10), 0);
  }
  for (const user of users) {
    const key = user.createdAt.toISOString().slice(0, 10);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  return [...buckets.entries()].map(([date, count]) => ({ date, count }));
}
