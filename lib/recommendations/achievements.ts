import "server-only";

import { prisma } from "@/lib/db/prisma";
import { computeTotals, getStreak } from "@/lib/progress/service";

/**
 * Gamification.
 *
 * Achievements are DATA, not code: each row in the `Achievement` table names a
 * `metric` and a `threshold`, and this module simply measures the metrics and
 * compares. Adding a new badge is a seed row, not a code change.
 *
 * Nothing is ever awarded speculatively — every metric below is measured from
 * real, persisted user activity.
 */

export type MetricSnapshot = {
  interviewsCompleted: number;
  assessmentsCompleted: number;
  questionsAnswered: number;
  problemsSolved: number;
  streakDays: number;
  bestInterviewScore: number;
  bestAssessmentScore: number;
};

export const ACHIEVEMENT_METRICS = [
  "interviewsCompleted",
  "assessmentsCompleted",
  "questionsAnswered",
  "problemsSolved",
  "streakDays",
  "bestInterviewScore",
  "bestAssessmentScore",
] as const;

export type AchievementMetric = (typeof ACHIEVEMENT_METRICS)[number];

export async function measureMetrics(userId: string): Promise<MetricSnapshot> {
  const [totals, streakDays, bestReport, bestAttempt] = await Promise.all([
    computeTotals(userId),
    getStreak(userId),
    prisma.interviewReport.aggregate({
      where: { interview: { userId } },
      _max: { overallScore: true },
    }),
    prisma.assessmentAttempt.aggregate({
      where: { userId, status: "SUBMITTED" },
      _max: { percentage: true },
    }),
  ]);

  return {
    interviewsCompleted: totals.interviewsCompleted,
    assessmentsCompleted: totals.assessmentsCompleted,
    questionsAnswered: totals.questionsAnswered,
    problemsSolved: totals.problemsSolved,
    streakDays,
    bestInterviewScore: bestReport._max.overallScore ?? 0,
    bestAssessmentScore: Math.round(bestAttempt._max.percentage ?? 0),
  };
}

export type UnlockedAchievement = {
  code: string;
  title: string;
  description: string;
  icon: string;
  points: number;
};

/**
 * Evaluates every achievement the user has not unlocked yet and awards the
 * ones whose threshold is now met. Returns only the NEWLY unlocked ones so the
 * caller can show a toast.
 */
export async function evaluateAchievements(
  userId: string,
): Promise<UnlockedAchievement[]> {
  const [achievements, existing, metrics] = await Promise.all([
    prisma.achievement.findMany(),
    prisma.userAchievement.findMany({
      where: { userId },
      select: { achievementId: true },
    }),
    measureMetrics(userId),
  ]);

  const alreadyUnlocked = new Set(existing.map((row) => row.achievementId));
  const newlyUnlocked: UnlockedAchievement[] = [];

  for (const achievement of achievements) {
    if (alreadyUnlocked.has(achievement.id)) continue;

    const metric = achievement.metric as AchievementMetric;
    const value = metrics[metric];
    // An unknown metric key means a bad seed row, not an unlock.
    if (typeof value !== "number") continue;
    if (value < achievement.threshold) continue;

    try {
      await prisma.userAchievement.create({
        data: { userId, achievementId: achievement.id },
      });
      newlyUnlocked.push({
        code: achievement.code,
        title: achievement.title,
        description: achievement.description,
        icon: achievement.icon,
        points: achievement.points,
      });
    } catch {
      // Unique constraint — another concurrent request already awarded it.
    }
  }

  return newlyUnlocked;
}

export type AchievementProgress = {
  code: string;
  title: string;
  description: string;
  icon: string;
  points: number;
  threshold: number;
  current: number;
  unlocked: boolean;
  unlockedAt: Date | null;
};

/** Full badge list with live progress, for the /progress page. */
export async function getAchievementProgress(
  userId: string,
): Promise<AchievementProgress[]> {
  const [achievements, unlocked, metrics] = await Promise.all([
    prisma.achievement.findMany({ orderBy: [{ metric: "asc" }, { threshold: "asc" }] }),
    prisma.userAchievement.findMany({ where: { userId } }),
    measureMetrics(userId),
  ]);

  const unlockedMap = new Map(
    unlocked.map((row) => [row.achievementId, row.unlockedAt]),
  );

  return achievements.map((achievement) => {
    const metric = achievement.metric as AchievementMetric;
    const current = metrics[metric] ?? 0;
    const unlockedAt = unlockedMap.get(achievement.id) ?? null;
    return {
      code: achievement.code,
      title: achievement.title,
      description: achievement.description,
      icon: achievement.icon,
      points: achievement.points,
      threshold: achievement.threshold,
      current: Math.min(current, achievement.threshold),
      unlocked: Boolean(unlockedAt),
      unlockedAt,
    };
  });
}
