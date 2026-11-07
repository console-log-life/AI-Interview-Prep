import "server-only";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { ConflictError } from "@/lib/api/errors";
import { hashPassword } from "@/lib/auth/password";
import { env } from "@/lib/env";
import type { CandidateContext } from "@/types/ai";

export async function findUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email: email.toLowerCase() } });
}

/**
 * Creates a user plus an empty profile in one transaction, so a signup can
 * never leave a user without the profile row every other page assumes exists.
 */
export async function createUser(input: {
  name: string;
  email: string;
  password: string;
}) {
  const email = input.email.toLowerCase();

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing) {
    throw new ConflictError("An account with that email already exists.");
  }

  const passwordHash = await hashPassword(input.password);
  const role = env.adminEmails.includes(email) ? "ADMIN" : "STUDENT";

  try {
    return await prisma.user.create({
      data: {
        name: input.name,
        email,
        passwordHash,
        role,
        profile: { create: {} },
      },
      select: { id: true, email: true, name: true, role: true },
    });
  } catch (error) {
    // Unique violation from a race between the check above and the insert.
    if (
      typeof error === "object" &&
      error !== null &&
      (error as { code?: string }).code === "P2002"
    ) {
      throw new ConflictError("An account with that email already exists.");
    }
    throw error;
  }
}

export const profileWithSkills = {
  profile: true,
  userSkills: { include: { skill: true } },
} satisfies Prisma.UserInclude;

export async function getUserWithProfile(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    include: profileWithSkills,
  });
}

/**
 * Builds the context object every AI prompt receives.
 *
 * One place decides what the model is allowed to know about a user — which
 * makes the privacy surface auditable rather than scattered across prompts.
 */
export async function buildCandidateContext(
  userId: string,
  options: { includeResume?: boolean; jobDescriptionId?: string } = {},
): Promise<CandidateContext> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: profileWithSkills,
  });

  const context: CandidateContext = {
    name: user?.name ?? "the candidate",
    targetRole: user?.profile?.targetRole ?? "Software Engineer",
    experienceLevel: user?.profile?.experienceLevel ?? "FRESHER",
    skills: user?.userSkills.map((entry) => entry.skill.name) ?? [],
    college: user?.profile?.college ?? null,
    degree: user?.profile?.degree ?? null,
    graduationYear: user?.profile?.graduationYear ?? null,
  };

  if (options.includeResume) {
    const resume = await prisma.resume.findFirst({
      where: { userId, status: "ANALYZED" },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }],
      include: { analysis: true },
    });
    if (resume?.analysis) {
      context.resumeSummary = resume.analysis.summary;
      context.resumeSkills = toStringArray(resume.analysis.skills).slice(0, 40);
      context.resumeProjects = toProjectTitles(resume.analysis.projects).slice(0, 8);
    }
  }

  if (options.jobDescriptionId) {
    const jd = await prisma.jobDescription.findFirst({
      where: { id: options.jobDescriptionId, userId },
      select: { requiredSkills: true, technologies: true },
    });
    if (jd) {
      context.jobRequirements = [
        ...toStringArray(jd.requiredSkills),
        ...toStringArray(jd.technologies),
      ].slice(0, 30);
    }
  }

  // Weak topics let the interviewer probe where it matters most.
  const weak = await prisma.topicPerformance.findMany({
    where: { userId, averageScore: { lt: 60 } },
    orderBy: { averageScore: "asc" },
    take: 5,
    select: { topic: true },
  });
  if (weak.length > 0) {
    context.weakTopics = weak.map((row) => row.topic);
  }

  return context;
}

/** Narrows an unknown JSON column to `string[]`. */
export function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function toProjectTitles(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object" && "name" in item) {
        const name = (item as { name?: unknown }).name;
        return typeof name === "string" ? name : null;
      }
      return null;
    })
    .filter((item): item is string => Boolean(item));
}
