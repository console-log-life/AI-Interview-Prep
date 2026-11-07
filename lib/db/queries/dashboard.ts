import "server-only";

import { prisma } from "@/lib/db/prisma";
import { profileCompleteness } from "@/lib/db/queries/profile";
import {
  computeReadinessScore,
  computeTotals,
  getStreak,
} from "@/lib/progress/service";
import { getActiveRecommendations } from "@/lib/recommendations/service";

/**
 * One aggregated read for the dashboard.
 *
 * Everything the page needs is fetched here in a single parallel batch rather
 * than each card doing its own round trip — that keeps the dashboard to a
 * predictable number of queries no matter how many cards it grows.
 */
export async function getDashboardData(userId: string) {
  const [
    totals,
    streak,
    recommendations,
    recentInterviews,
    recentAttempts,
    recentSubmissions,
    topTopics,
    weakTopics,
    snapshots,
    profile,
    skillCount,
    resumeCount,
    achievementCount,
  ] = await Promise.all([
    computeTotals(userId),
    getStreak(userId),
    getActiveRecommendations(userId, 4),
    prisma.interview.findMany({
      where: { userId },
      include: { report: { select: { overallScore: true } } },
      orderBy: { createdAt: "desc" },
      take: 4,
    }),
    prisma.assessmentAttempt.findMany({
      where: { userId, status: { in: ["SUBMITTED", "EXPIRED"] } },
      include: { assessment: { select: { title: true, category: true } } },
      orderBy: { submittedAt: "desc" },
      take: 4,
    }),
    prisma.codingSubmission.findMany({
      where: { userId, isRunOnly: false },
      include: { problem: { select: { title: true, slug: true, difficulty: true } } },
      orderBy: { createdAt: "desc" },
      take: 4,
    }),
    prisma.topicPerformance.findMany({
      where: { userId },
      orderBy: { averageScore: "desc" },
      take: 5,
    }),
    prisma.topicPerformance.findMany({
      where: { userId, averageScore: { lt: 60 } },
      orderBy: { averageScore: "asc" },
      take: 5,
    }),
    prisma.progressSnapshot.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      take: 40,
    }),
    prisma.profile.findUnique({ where: { userId } }),
    prisma.userSkill.count({ where: { userId } }),
    prisma.resume.count({ where: { userId } }),
    prisma.userAchievement.count({ where: { userId } }),
  ]);

  const readinessScore = computeReadinessScore(totals);

  // Delta vs the second-most-recent snapshot, so the arrow means something.
  const previous = snapshots.length >= 2 ? snapshots[snapshots.length - 2] : null;
  const readinessDelta = previous
    ? readinessScore - previous.readinessScore
    : null;

  return {
    totals,
    readinessScore,
    readinessDelta,
    streak,
    recommendations,
    recentInterviews,
    recentAttempts,
    recentSubmissions,
    topTopics,
    weakTopics,
    snapshots,
    achievementCount,
    profileCompleteness: profileCompleteness({
      targetRole: profile?.targetRole,
      college: profile?.college,
      degree: profile?.degree,
      graduationYear: profile?.graduationYear,
      experienceLevel: profile?.experienceLevel,
      skillCount,
      hasResume: resumeCount > 0,
    }),
    targetRole: profile?.targetRole ?? null,
    hasAnyActivity:
      totals.interviewsCompleted > 0 ||
      totals.assessmentsCompleted > 0 ||
      totals.problemsSolved > 0,
  };
}

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;
