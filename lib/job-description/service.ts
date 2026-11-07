import "server-only";
import type { Prisma } from "@prisma/client";

import { getAIService } from "@/lib/ai";
import { NotFoundError } from "@/lib/api/errors";
import { prisma } from "@/lib/db/prisma";
import { buildCandidateContext } from "@/lib/db/queries/users";
import { recordActivity } from "@/lib/progress/service";
import { refreshRecommendations } from "@/lib/recommendations/service";
import type { AnalyzeJobDescriptionInput } from "@/types/job-description";

/**
 * Job-description analysis.
 *
 * The JD is analysed AGAINST the signed-in candidate (profile skills + the
 * analysed resume), which is what turns a generic keyword extractor into a
 * personalised gap analysis and study roadmap.
 */
export async function analyzeJobDescription(
  userId: string,
  input: AnalyzeJobDescriptionInput,
) {
  const candidate = await buildCandidateContext(userId, { includeResume: true });

  const ai = getAIService();
  const analysis = await ai.analyzeJobDescription({
    candidate,
    title: input.title,
    company: input.company || null,
    rawText: input.rawText,
  });

  const record = await prisma.jobDescription.create({
    data: {
      userId,
      title: input.title,
      company: input.company || null,
      rawText: input.rawText,
      requiredSkills: analysis.requiredSkills as unknown as Prisma.InputJsonValue,
      preferredSkills: analysis.preferredSkills as unknown as Prisma.InputJsonValue,
      technologies: analysis.technologies as unknown as Prisma.InputJsonValue,
      responsibilities: analysis.responsibilities as unknown as Prisma.InputJsonValue,
      keywords: analysis.keywords as unknown as Prisma.InputJsonValue,
      experienceReq: analysis.experienceReq || null,
      skillMatch: analysis.skillMatch as unknown as Prisma.InputJsonValue,
      missingSkills: analysis.missingSkills as unknown as Prisma.InputJsonValue,
      matchScore: Math.round(analysis.matchScore),
      roadmap: analysis.roadmap as unknown as Prisma.InputJsonValue,
      suggestedTopics: analysis.suggestedTopics,
      modelUsed: ai.model,
    },
  });

  await recordActivity(userId, "JOB_DESCRIPTION");
  // Gaps found here feed straight into the recommendation engine.
  await refreshRecommendations(userId);

  return record;
}

export async function getJobDescription(userId: string, id: string) {
  const record = await prisma.jobDescription.findFirst({
    where: { id, userId },
  });
  if (!record) throw new NotFoundError("We could not find that analysis.");
  return record;
}

export async function listJobDescriptions(userId: string, limit = 20) {
  return prisma.jobDescription.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      title: true,
      company: true,
      matchScore: true,
      createdAt: true,
      suggestedTopics: true,
    },
  });
}

export async function deleteJobDescription(userId: string, id: string) {
  const record = await prisma.jobDescription.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!record) throw new NotFoundError("We could not find that analysis.");
  await prisma.jobDescription.delete({ where: { id } });
}
