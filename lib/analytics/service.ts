import "server-only";

import { prisma } from "@/lib/db/prisma";
import {
  computeReadiness,
  CONFIDENCE_LEVEL_LABEL,
  type ReadinessResult,
} from "@/lib/analytics/readiness";
import { getStreak } from "@/lib/progress/service";
import { getRepeatedMistakes } from "@/lib/mistakes/service";
import {
  getHeadlineSkills,
  getStrongSkills,
  getWeakSkills,
} from "@/lib/skills/service";
import { ROOT_SKILL_KEYS } from "@/lib/skills/graph";
import type { CoachGrounding } from "@/types/ai";
import type { ExperienceLevel } from "@/types/user";

/**
 * Gathers the real, measured facts behind readiness — and behind every AI
 * feature that claims to know something about the user.
 *
 * `buildGrounding` is the single place that decides what the AI is allowed to
 * assert about a candidate. Anything not returned here cannot be claimed.
 */

export async function computeReadinessV2(
  userId: string,
): Promise<ReadinessResult> {
  const [
    interviewAgg,
    lastInterview,
    assessmentAgg,
    lastAssessment,
    solvedProblems,
    lastSubmission,
    acceptedCount,
    submissionCount,
    skillProfiles,
    repeatedMistakes,
  ] = await Promise.all([
    prisma.interviewReport.aggregate({
      where: { interview: { userId } },
      _avg: { overallScore: true },
      _count: { _all: true },
    }),
    prisma.interview.findFirst({
      where: { userId, status: "COMPLETED" },
      orderBy: { completedAt: "desc" },
      select: { completedAt: true },
    }),
    prisma.assessmentAttempt.aggregate({
      where: { userId, status: { in: ["SUBMITTED", "EXPIRED"] } },
      _avg: { percentage: true },
      _count: { _all: true },
    }),
    prisma.assessmentAttempt.findFirst({
      where: { userId, status: { in: ["SUBMITTED", "EXPIRED"] } },
      orderBy: { submittedAt: "desc" },
      select: { submittedAt: true },
    }),
    prisma.codingSubmission.findMany({
      where: { userId, status: "ACCEPTED", isRunOnly: false },
      select: { problemId: true },
      distinct: ["problemId"],
    }),
    prisma.codingSubmission.findFirst({
      where: { userId, isRunOnly: false },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    prisma.codingSubmission.count({
      where: { userId, status: "ACCEPTED", isRunOnly: false },
    }),
    prisma.codingSubmission.count({ where: { userId, isRunOnly: false } }),
    prisma.skillProfile.findMany({
      where: { userId, skillKey: { in: ROOT_SKILL_KEYS }, observations: { gt: 0 } },
      select: { confidence: true },
    }),
    prisma.mistake.count({
      where: { userId, status: "ACTIVE", frequency: { gt: 1 } },
    }),
  ]);

  const meanSkillConfidence =
    skillProfiles.length > 0
      ? skillProfiles.reduce((sum, row) => sum + row.confidence, 0) /
        skillProfiles.length
      : 0;

  return computeReadiness({
    interview: {
      score: interviewAgg._count._all > 0 ? (interviewAgg._avg.overallScore ?? 0) : null,
      count: interviewAgg._count._all,
      lastAt: lastInterview?.completedAt ?? null,
    },
    assessment: {
      score: assessmentAgg._count._all > 0 ? (assessmentAgg._avg.percentage ?? 0) : null,
      count: assessmentAgg._count._all,
      lastAt: lastAssessment?.submittedAt ?? null,
    },
    coding: {
      score:
        submissionCount > 0 ? (acceptedCount / submissionCount) * 100 : null,
      count: solvedProblems.length,
      lastAt: lastSubmission?.createdAt ?? null,
    },
    skillsCovered: skillProfiles.length,
    totalSkills: ROOT_SKILL_KEYS.length,
    meanSkillConfidence,
    repeatedMistakes,
  });
}

/**
 * The grounding pack handed to the AI coach and roadmap generator.
 *
 * Everything in here is measured. Nothing is estimated or inferred — if a
 * value is unknown it is reported as zero/empty rather than guessed, so the
 * model can say "you have not practised this" instead of inventing a number.
 */
export async function buildGrounding(userId: string): Promise<CoachGrounding> {
  const [
    profile,
    readiness,
    headline,
    weak,
    strong,
    repeated,
    streakDays,
    counts,
    recentInterviews,
    recentAttempts,
    recentSubmissions,
    resumeCount,
    latestJd,
  ] = await Promise.all([
    prisma.profile.findUnique({
      where: { userId },
      select: { targetRole: true, experienceLevel: true },
    }),
    computeReadinessV2(userId),
    getHeadlineSkills(userId),
    getWeakSkills(userId, 5),
    getStrongSkills(userId, 5),
    getRepeatedMistakes(userId, 5),
    getStreak(userId),
    Promise.all([
      prisma.interview.count({ where: { userId, status: "COMPLETED" } }),
      prisma.assessmentAttempt.count({
        where: { userId, status: { in: ["SUBMITTED", "EXPIRED"] } },
      }),
      prisma.codingSubmission.findMany({
        where: { userId, status: "ACCEPTED", isRunOnly: false },
        select: { problemId: true },
        distinct: ["problemId"],
      }),
    ]),
    prisma.interview.findMany({
      where: { userId, status: "COMPLETED" },
      orderBy: { completedAt: "desc" },
      take: 3,
      select: {
        targetRole: true,
        type: true,
        completedAt: true,
        report: { select: { overallScore: true } },
      },
    }),
    prisma.assessmentAttempt.findMany({
      where: { userId, status: { in: ["SUBMITTED", "EXPIRED"] } },
      orderBy: { submittedAt: "desc" },
      take: 3,
      select: {
        percentage: true,
        submittedAt: true,
        assessment: { select: { title: true } },
      },
    }),
    prisma.codingSubmission.findMany({
      where: { userId, isRunOnly: false },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: {
        status: true,
        createdAt: true,
        problem: { select: { title: true } },
      },
    }),
    prisma.resume.count({ where: { userId, status: "ANALYZED" } }),
    prisma.jobDescription.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { title: true, company: true, missingSkills: true },
    }),
  ]);

  const [interviewsCompleted, assessmentsCompleted, solved] = counts;

  const recentActivity: string[] = [
    ...recentInterviews.map(
      (row) =>
        `Interview (${row.type}) for ${row.targetRole} on ${fmt(row.completedAt)}: ${
          row.report ? `${row.report.overallScore}/100` : "no report"
        }`,
    ),
    ...recentAttempts.map(
      (row) =>
        `Assessment "${row.assessment.title}" on ${fmt(row.submittedAt)}: ${Math.round(row.percentage)}%`,
    ),
    ...recentSubmissions.map(
      (row) =>
        `Coding "${row.problem.title}" on ${fmt(row.createdAt)}: ${row.status}`,
    ),
  ];

  const jobGaps = Array.isArray(latestJd?.missingSkills)
    ? (latestJd.missingSkills as unknown[]).filter(
        (item): item is string => typeof item === "string",
      )
    : [];

  return {
    targetRole: profile?.targetRole ?? "Software Engineer",
    experienceLevel: (profile?.experienceLevel ?? "FRESHER") as ExperienceLevel,
    readiness: readiness.readiness,
    confidenceLevel: CONFIDENCE_LEVEL_LABEL[readiness.confidence],
    interviewsCompleted,
    assessmentsCompleted,
    problemsSolved: solved.length,
    streakDays,
    skills: headline
      .filter((skill) => skill.observations > 0)
      .map((skill) => ({
        label: skill.label,
        score: skill.score,
        confidence: skill.confidence,
        trend: skill.trend,
      })),
    weakSkills: weak.map((skill) => ({ label: skill.label, score: skill.score })),
    strongSkills: strong.map((skill) => ({
      label: skill.label,
      score: skill.score,
    })),
    repeatedMistakes: repeated.map((mistake) => ({
      label: mistake.label,
      frequency: mistake.frequency,
      lastSeen: fmt(mistake.lastSeenAt),
    })),
    recentActivity,
    hasResume: resumeCount > 0,
    targetJob: latestJd
      ? `${latestJd.title}${latestJd.company ? ` at ${latestJd.company}` : ""}`
      : null,
    jobGaps,
  };
}

function fmt(date: Date | null | undefined): string {
  if (!date) return "unknown date";
  return date.toISOString().slice(0, 10);
}
