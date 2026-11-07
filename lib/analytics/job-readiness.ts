import "server-only";

import { NotFoundError } from "@/lib/api/errors";
import {
  computeJobReadiness,
  type JobReadinessResult,
} from "@/lib/analytics/readiness";
import { buildJobRequirements } from "@/lib/analytics/job-requirements";
import { prisma } from "@/lib/db/prisma";

/**
 * Readiness against one specific job description.
 *
 * This is a different number from the JD `matchScore` the AI produces, and the
 * difference matters: `matchScore` compares the *resume text* to the posting,
 * while this compares *measured performance* to it. A resume can claim Kafka;
 * only an answer can demonstrate it.
 *
 * Requirements the skill graph cannot map are reported as `unknown` rather
 * than silently dropped — an unmeasurable requirement is still a risk, and
 * pretending otherwise would inflate the score.
 */

export type JobReadinessView = JobReadinessResult & {
  jobDescriptionId: string;
  title: string;
  company: string | null;
  /** The AI's resume-vs-posting score, for contrast. Null if not analysed. */
  resumeMatchScore: number | null;
  requirementCount: number;
};

export async function getJobReadiness(
  userId: string,
  jobDescriptionId: string,
): Promise<JobReadinessView> {
  const jd = await prisma.jobDescription.findFirst({
    where: { id: jobDescriptionId, userId },
    select: {
      id: true,
      title: true,
      company: true,
      matchScore: true,
      requiredSkills: true,
      preferredSkills: true,
    },
  });

  if (!jd) throw new NotFoundError("We could not find that job description.");

  const requirements = buildJobRequirements({
    required: toStrings(jd.requiredSkills),
    preferred: toStrings(jd.preferredSkills),
  });

  const profiles = await prisma.skillProfile.findMany({
    where: { userId, observations: { gt: 0 } },
    select: { skillKey: true, score: true, confidence: true },
  });

  const skillScores = new Map(
    profiles.map((profile) => [
      profile.skillKey,
      { score: profile.score, confidence: profile.confidence },
    ]),
  );

  const result = computeJobReadiness({ requirements, skillScores });

  return {
    ...result,
    jobDescriptionId: jd.id,
    title: jd.title,
    company: jd.company,
    resumeMatchScore: jd.matchScore,
    requirementCount: requirements.length,
  };
}

function toStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}
