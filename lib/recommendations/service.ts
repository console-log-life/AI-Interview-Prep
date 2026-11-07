import "server-only";
import type { QuestionCategory } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { runRecommendationEngine, type SignalSet } from "./engine";

/**
 * Bridges the pure rule engine to the database: gathers signals, runs the
 * rules, and reconciles the result with the stored recommendations so the
 * user's dismissals survive a refresh.
 */

export async function collectSignals(userId: string): Promise<SignalSet> {
  const [
    topics,
    interviewsCompleted,
    assessmentsCompleted,
    solvedProblems,
    resume,
    profile,
    latestJd,
    lastActivity,
  ] = await Promise.all([
    prisma.topicPerformance.findMany({
      where: { userId },
      orderBy: { averageScore: "asc" },
      take: 40,
    }),
    prisma.interview.count({ where: { userId, status: "COMPLETED" } }),
    prisma.assessmentAttempt.count({ where: { userId, status: "SUBMITTED" } }),
    prisma.codingSubmission.findMany({
      where: { userId, status: "ACCEPTED", isRunOnly: false },
      select: { problemId: true },
      distinct: ["problemId"],
    }),
    prisma.resume.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true },
    }),
    prisma.profile.findUnique({
      where: { userId },
      select: { targetRole: true },
    }),
    prisma.jobDescription.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { missingSkills: true },
    }),
    prisma.practiceActivity.findFirst({
      where: { userId },
      orderBy: { day: "desc" },
      select: { day: true },
    }),
  ]);

  const skillCount = await prisma.userSkill.count({ where: { userId } });

  const missing = Array.isArray(latestJd?.missingSkills)
    ? (latestJd.missingSkills as unknown[]).filter(
        (item): item is string => typeof item === "string",
      )
    : [];

  const daysSinceLastActivity = lastActivity
    ? Math.floor(
        (Date.now() - lastActivity.day.getTime()) / 86_400_000,
      )
    : null;

  return {
    topics: topics.map((topic) => ({
      topic: topic.topic,
      category: topic.category,
      averageScore: topic.averageScore,
      attempts: topic.totalAttempts,
      lastPracticedAt: topic.lastPracticedAt,
    })),
    interviewsCompleted,
    assessmentsCompleted,
    problemsSolved: solvedProblems.length,
    hasResume: Boolean(resume),
    hasAnalyzedResume: resume?.status === "ANALYZED",
    hasTargetRole: Boolean(profile?.targetRole),
    hasSkills: skillCount > 0,
    jobDescriptionGaps: missing,
    daysSinceLastActivity,
  };
}

/**
 * Recomputes recommendations and syncs them to the DB.
 *
 * Upsert-on-(userId, kind, topic) means a rule that keeps firing updates the
 * existing row instead of piling up duplicates, and a recommendation the user
 * dismissed stays dismissed until the underlying signal actually changes.
 */
export async function refreshRecommendations(userId: string): Promise<number> {
  const signals = await collectSignals(userId);
  const generated = runRecommendationEngine(signals);

  await Promise.all(
    generated.map((rec) =>
      prisma.recommendation.upsert({
        where: {
          userId_kind_topic: {
            userId,
            kind: rec.kind,
            topic: rec.topic ?? "",
          },
        },
        create: {
          userId,
          kind: rec.kind,
          priority: rec.priority,
          title: rec.title,
          reason: rec.reason,
          topic: rec.topic ?? "",
          category: rec.category as QuestionCategory | null,
          actionUrl: rec.actionUrl,
          actionLabel: rec.actionLabel,
          triggerScore: rec.triggerScore,
          source: "engine",
        },
        update: {
          priority: rec.priority,
          title: rec.title,
          reason: rec.reason,
          category: rec.category as QuestionCategory | null,
          actionUrl: rec.actionUrl,
          actionLabel: rec.actionLabel,
          triggerScore: rec.triggerScore,
        },
      }),
    ),
  );

  // Retire engine recommendations whose rule no longer fires (e.g. the user
  // fixed the weak topic), so stale advice does not linger.
  const liveKeys = new Set(
    generated.map((rec) => `${rec.kind}:${rec.topic ?? ""}`),
  );
  const stored = await prisma.recommendation.findMany({
    where: { userId, source: "engine", isCompleted: false },
    select: { id: true, kind: true, topic: true },
  });
  const stale = stored
    .filter((row) => !liveKeys.has(`${row.kind}:${row.topic ?? ""}`))
    .map((row) => row.id);

  if (stale.length > 0) {
    await prisma.recommendation.updateMany({
      where: { id: { in: stale } },
      data: { isCompleted: true },
    });
  }

  return generated.length;
}

export async function getActiveRecommendations(userId: string, limit = 6) {
  return prisma.recommendation.findMany({
    where: { userId, isDismissed: false, isCompleted: false },
    orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
    take: limit,
  });
}
