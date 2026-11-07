import { ok, route } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import {
  computeReadinessScore,
  computeTotals,
  getStreak,
} from "@/lib/progress/service";

/**
 * GET /api/progress — the signed-in user's progress summary.
 *
 * Exists so the numbers behind the dashboard are inspectable and reusable
 * (and testable) rather than only being computed inside a server component.
 */
export const GET = route(async () => {
  const user = await requireUser();

  const [totals, streak, topics, snapshots] = await Promise.all([
    computeTotals(user.id),
    getStreak(user.id),
    prisma.topicPerformance.findMany({
      where: { userId: user.id },
      orderBy: { averageScore: "asc" },
      take: 50,
    }),
    prisma.progressSnapshot.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      take: 60,
    }),
  ]);

  return ok({
    readinessScore: computeReadinessScore(totals),
    streak,
    totals,
    topics: topics.map((topic) => ({
      topic: topic.topic,
      category: topic.category,
      averageScore: Math.round(topic.averageScore),
      bestScore: Math.round(topic.bestScore),
      lastScore: Math.round(topic.lastScore),
      attempts: topic.totalAttempts,
      lastPracticedAt: topic.lastPracticedAt,
    })),
    history: snapshots.map((snapshot) => ({
      date: snapshot.createdAt,
      readiness: snapshot.readinessScore,
      interview: Math.round(snapshot.interviewAvg),
      assessment: Math.round(snapshot.assessmentAvg),
      coding: Math.round(snapshot.codingAvg),
    })),
  });
});

export const dynamic = "force-dynamic";
