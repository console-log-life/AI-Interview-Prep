import "server-only";
import type { CodeLanguage, QuestionCategory } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { slugify } from "@/lib/utils";
import type { ProfileInput } from "@/lib/validation/profile";

/** Best-effort mapping of a skill name to a question category. */
const CATEGORY_HINTS: Array<[RegExp, QuestionCategory]> = [
  [/\b(java|spring|hibernate|jvm)\b/i, "JAVA"],
  [/\b(python|django|flask|pandas|numpy)\b/i, "PYTHON"],
  [/\b(javascript|typescript|react|node|next|angular|vue)\b/i, "JAVASCRIPT"],
  [/\b(sql|mysql|postgres|database|dbms|mongo|nosql|redis)\b/i, "DBMS"],
  [/\b(algorithm|data structure|dsa|leetcode|graph|tree|dynamic programming)\b/i, "DSA"],
  [/\b(oop|object oriented|design pattern|solid)\b/i, "OOP"],
  [/\b(operating system|os|thread|process|concurrency|deadlock)\b/i, "OPERATING_SYSTEMS"],
  [/\b(network|tcp|http|dns|socket)\b/i, "COMPUTER_NETWORKS"],
  [/\b(system design|microservice|scalab|kafka|architecture|docker|kubernetes|aws)\b/i, "SYSTEM_DESIGN"],
];

export function inferSkillCategory(name: string): QuestionCategory {
  for (const [pattern, category] of CATEGORY_HINTS) {
    if (pattern.test(name)) return category;
  }
  return "DSA";
}

/**
 * Finds or creates canonical Skill rows for the given names.
 *
 * Skills are normalised (slug) so "React.js", "react js" and "React" all land
 * on one row — otherwise skill-based matching would be useless.
 */
export async function upsertSkills(names: string[]) {
  const unique = new Map<string, string>();
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    const slug = slugify(name);
    if (slug && !unique.has(slug)) unique.set(slug, name);
  }

  return Promise.all(
    [...unique.entries()].map(([slug, name]) =>
      prisma.skill.upsert({
        where: { slug },
        create: { name, slug, category: inferSkillCategory(name) },
        update: {},
      }),
    ),
  );
}

/** Replaces the user's skill set with exactly the names supplied. */
export async function setUserSkills(
  userId: string,
  names: string[],
  source: "manual" | "resume" = "manual",
) {
  const skills = await upsertSkills(names);
  const keepIds = skills.map((skill) => skill.id);

  await prisma.$transaction([
    prisma.userSkill.deleteMany({
      where: { userId, skillId: { notIn: keepIds.length ? keepIds : ["__none__"] } },
    }),
    ...skills.map((skill) =>
      prisma.userSkill.upsert({
        where: { userId_skillId: { userId, skillId: skill.id } },
        create: { userId, skillId: skill.id, source },
        update: { source },
      }),
    ),
  ]);
}

/** Adds skills without removing existing ones (used by resume import). */
export async function addUserSkills(userId: string, names: string[]) {
  const skills = await upsertSkills(names);
  await Promise.all(
    skills.map((skill) =>
      prisma.userSkill.upsert({
        where: { userId_skillId: { userId, skillId: skill.id } },
        create: { userId, skillId: skill.id, source: "resume" },
        update: {},
      }),
    ),
  );
}

function emptyToNull(value: string | undefined | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function saveProfile(userId: string, input: ProfileInput) {
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { name: input.name },
    });

    await tx.profile.upsert({
      where: { userId },
      create: {
        userId,
        headline: emptyToNull(input.headline),
        bio: emptyToNull(input.bio),
        college: emptyToNull(input.college),
        degree: emptyToNull(input.degree),
        branch: emptyToNull(input.branch),
        graduationYear: input.graduationYear ?? null,
        cgpa: input.cgpa ?? null,
        experienceLevel: input.experienceLevel,
        targetRole: emptyToNull(input.targetRole),
        targetCompanies: input.targetCompanies,
        preferredLangs: input.preferredLangs as CodeLanguage[],
        location: emptyToNull(input.location),
        phone: emptyToNull(input.phone),
        githubUrl: emptyToNull(input.githubUrl),
        linkedinUrl: emptyToNull(input.linkedinUrl),
        portfolioUrl: emptyToNull(input.portfolioUrl),
        onboardedAt: new Date(),
      },
      update: {
        headline: emptyToNull(input.headline),
        bio: emptyToNull(input.bio),
        college: emptyToNull(input.college),
        degree: emptyToNull(input.degree),
        branch: emptyToNull(input.branch),
        graduationYear: input.graduationYear ?? null,
        cgpa: input.cgpa ?? null,
        experienceLevel: input.experienceLevel,
        targetRole: emptyToNull(input.targetRole),
        targetCompanies: input.targetCompanies,
        preferredLangs: input.preferredLangs as CodeLanguage[],
        location: emptyToNull(input.location),
        phone: emptyToNull(input.phone),
        githubUrl: emptyToNull(input.githubUrl),
        linkedinUrl: emptyToNull(input.linkedinUrl),
        portfolioUrl: emptyToNull(input.portfolioUrl),
      },
    });
  });

  await setUserSkills(userId, input.skills);
}

export async function getProfileForForm(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      profile: true,
      userSkills: { include: { skill: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!user) return null;

  return {
    name: user.name ?? "",
    email: user.email,
    headline: user.profile?.headline ?? "",
    bio: user.profile?.bio ?? "",
    college: user.profile?.college ?? "",
    degree: user.profile?.degree ?? "",
    branch: user.profile?.branch ?? "",
    graduationYear: user.profile?.graduationYear ?? undefined,
    cgpa: user.profile?.cgpa ?? undefined,
    experienceLevel: user.profile?.experienceLevel ?? "FRESHER",
    targetRole: user.profile?.targetRole ?? "",
    targetCompanies: user.profile?.targetCompanies ?? [],
    preferredLangs: user.profile?.preferredLangs ?? [],
    skills: user.userSkills.map((entry) => entry.skill.name),
    location: user.profile?.location ?? "",
    phone: user.profile?.phone ?? "",
    githubUrl: user.profile?.githubUrl ?? "",
    linkedinUrl: user.profile?.linkedinUrl ?? "",
    portfolioUrl: user.profile?.portfolioUrl ?? "",
  };
}

/** Percentage of profile fields that are filled in — drives the nudge card. */
export function profileCompleteness(profile: {
  targetRole?: string | null;
  college?: string | null;
  degree?: string | null;
  graduationYear?: number | null;
  experienceLevel?: string | null;
  skillCount: number;
  hasResume: boolean;
}): number {
  const checks = [
    Boolean(profile.targetRole),
    Boolean(profile.college),
    Boolean(profile.degree),
    Boolean(profile.graduationYear),
    Boolean(profile.experienceLevel),
    profile.skillCount > 0,
    profile.hasResume,
  ];
  const done = checks.filter(Boolean).length;
  return Math.round((done / checks.length) * 100);
}
