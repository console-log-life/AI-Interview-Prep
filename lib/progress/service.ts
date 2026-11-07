import "server-only";
import type { ActivityKind, QuestionCategory } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { utcDay } from "@/lib/utils";

/**
 * Progress tracking.
 *
 * Every scored activity funnels through here so that topic performance, the
 * practice streak and the historical snapshot stay in step. Nothing is
 * recomputed from scratch on page load — the dashboard reads stored rows.
 */

export type TopicScore = {
  topic: string;
  category: QuestionCategory;
  /** 0-100. */
  score: number;
};

/**
 * Folds a new observation into a topic's rolling average.
 *
 * Uses an incremental mean (`totalScore / totalAttempts`) rather than
 * re-reading every past attempt, so the cost is O(1) per update regardless of
 * how much history the user has.
 */
export async function recordTopicPerformance(
  userId: string,
  scores: TopicScore[],
): Promise<void> {
  if (scores.length === 0) return;

  // Collapse duplicates within one submission before touching the DB.
  const merged = new Map<string, { category: QuestionCategory; total: number; count: number }>();
  for (const entry of scores) {
    const key = entry.topic;
    const existing = merged.get(key);
    if (existing) {
      existing.total += entry.score;
      existing.count += 1;
    } else {
      merged.set(key, { category: entry.category, total: entry.score, count: 1 });
    }
  }

  const now = new Date();

  await Promise.all(
    [...merged.entries()].map(async ([topic, { category, total, count }]) => {
      const observed = total / count;
      const existing = await prisma.topicPerformance.findUnique({
        where: { userId_topic: { userId, topic } },
        select: { totalAttempts: true, totalScore: true, bestScore: true },
      });

      if (!existing) {
        await prisma.topicPerformance.create({
          data: {
            userId,
            topic,
            category,
            totalAttempts: 1,
            totalScore: observed,
            averageScore: observed,
            bestScore: observed,
            lastScore: observed,
            lastPracticedAt: now,
          },
        });
        return;
      }

      const totalAttempts = existing.totalAttempts + 1;
      const totalScore = existing.totalScore + observed;

      await prisma.topicPerformance.update({
        where: { userId_topic: { userId, topic } },
        data: {
          category,
          totalAttempts,
          totalScore,
          averageScore: totalScore / totalAttempts,
          bestScore: Math.max(existing.bestScore, observed),
          lastScore: observed,
          lastPracticedAt: now,
        },
      });
    }),
  );
}

/** Records one unit of practice for today — idempotent per (user, kind, day). */
export async function recordActivity(
  userId: string,
  kind: ActivityKind,
): Promise<void> {
  const day = utcDay();
  await prisma.practiceActivity.upsert({
    where: { userId_kind_day: { userId, kind, day } },
    create: { userId, kind, day, count: 1 },
    update: { count: { increment: 1 } },
  });
}

export type ProgressTotals = {
  interviewAvg: number;
  assessmentAvg: number;
  codingAvg: number;
  interviewsCompleted: number;
  assessmentsCompleted: number;
  problemsSolved: number;
  questionsAnswered: number;
};

/** Aggregates the user's lifetime numbers in a handful of queries. */
export async function computeTotals(userId: string): Promise<ProgressTotals> {
  const [reportAgg, attemptAgg, solvedProblems, totalSubmissions, answeredAgg] =
    await Promise.all([
      prisma.interviewReport.aggregate({
        where: { interview: { userId } },
        _avg: { overallScore: true },
        _count: { _all: true },
      }),
      prisma.assessmentAttempt.aggregate({
        where: { userId, status: "SUBMITTED" },
        _avg: { percentage: true },
        _count: { _all: true },
      }),
      prisma.codingSubmission.findMany({
        where: { userId, status: "ACCEPTED", isRunOnly: false },
        select: { problemId: true },
        distinct: ["problemId"],
      }),
      prisma.codingSubmission.count({
        where: { userId, isRunOnly: false },
      }),
      prisma.assessmentAnswer.count({
        where: { attempt: { userId, status: "SUBMITTED" } },
      }),
    ]);

  const problemsSolved = solvedProblems.length;
  // Coding "score" = acceptance rate across real submissions.
  const codingAvg =
    totalSubmissions > 0
      ? (await prisma.codingSubmission.count({
          where: { userId, status: "ACCEPTED", isRunOnly: false },
        })) / totalSubmissions * 100
      : 0;

  return {
    interviewAvg: Math.round(reportAgg._avg.overallScore ?? 0),
    assessmentAvg: Math.round(attemptAgg._avg.percentage ?? 0),
    codingAvg: Math.round(codingAvg),
    interviewsCompleted: reportAgg._count._all,
    assessmentsCompleted: attemptAgg._count._all,
    problemsSolved,
    questionsAnswered: answeredAgg,
  };
}

/**
 * Interview readiness — a single 0-100 headline number.
 *
 * Weighted 40/35/25 across interviews, assessments and coding, then scaled by
 * an activity factor so a user with one lucky attempt cannot show "92% ready".
 * The scaling is what makes the number honest for a new account.
 */
export function computeReadinessScore(totals: ProgressTotals): number {
  const { interviewAvg, assessmentAvg, codingAvg } = totals;

  const components: Array<{ value: number; weight: number }> = [];
  if (totals.interviewsCompleted > 0) {
    components.push({ value: interviewAvg, weight: 0.4 });
  }
  if (totals.assessmentsCompleted > 0) {
    components.push({ value: assessmentAvg, weight: 0.35 });
  }
  if (totals.problemsSolved > 0) {
    components.push({ value: codingAvg, weight: 0.25 });
  }
  if (components.length === 0) return 0;

  const weightSum = components.reduce((sum, c) => sum + c.weight, 0);
  const weighted =
    components.reduce((sum, c) => sum + c.value * c.weight, 0) / weightSum;

  // Confidence ramp: full credit only once there is a real body of practice.
  const evidence =
    totals.interviewsCompleted * 3 +
    totals.assessmentsCompleted * 2 +
    totals.problemsSolved;
  const confidence = Math.min(1, evidence / 15);

  return Math.round(weighted * confidence);
}

/** Writes a history point so the progress chart shows real, dated data. */
export async function writeProgressSnapshot(userId: string): Promise<void> {
  const totals = await computeTotals(userId);
  await prisma.progressSnapshot.create({
    data: {
      userId,
      readinessScore: computeReadinessScore(totals),
      interviewAvg: totals.interviewAvg,
      assessmentAvg: totals.assessmentAvg,
      codingAvg: totals.codingAvg,
      interviewsCompleted: totals.interviewsCompleted,
      assessmentsCompleted: totals.assessmentsCompleted,
      problemsSolved: totals.problemsSolved,
      questionsAnswered: totals.questionsAnswered,
    },
  });
}

/**
 * Longest run of consecutive days (ending today or yesterday) with activity.
 * Yesterday counts so the streak does not visibly break before the user has
 * had a chance to practise today.
 */
export function computeStreak(days: Date[], today: Date = new Date()): number {
  if (days.length === 0) return 0;

  const unique = [
    ...new Set(days.map((d) => utcDay(d).getTime())),
  ].sort((a, b) => b - a);

  const todayUtc = utcDay(today).getTime();
  const DAY_MS = 86_400_000;

  if (unique[0] !== todayUtc && unique[0] !== todayUtc - DAY_MS) return 0;

  let streak = 1;
  for (let i = 1; i < unique.length; i += 1) {
    if (unique[i - 1] - unique[i] === DAY_MS) streak += 1;
    else break;
  }
  return streak;
}

export async function getStreak(userId: string): Promise<number> {
  const rows = await prisma.practiceActivity.findMany({
    where: { userId },
    select: { day: true },
    orderBy: { day: "desc" },
    take: 400,
  });
  return computeStreak(rows.map((row) => row.day));
}
