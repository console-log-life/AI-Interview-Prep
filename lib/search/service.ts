import "server-only";

import { prisma } from "@/lib/db/prisma";
import { SKILL_GRAPH } from "@/lib/skills/graph";

/**
 * Global search.
 *
 * Every result is a real row the user owns, or a real skill from the graph.
 * Static commands ("Start an interview") are handled entirely client-side and
 * never reach here, so nothing in this file is invented.
 *
 * Queries are scoped by `userId` in the `where` clause, never filtered after
 * the fact — a search box is exactly the kind of endpoint where a missing
 * scope quietly leaks another account's data.
 */

export type SearchGroup =
  | "Interviews"
  | "Assessments"
  | "Coding"
  | "Skills"
  | "Roadmap"
  | "Job matching"
  | "Resume";

export type SearchResult = {
  id: string;
  group: SearchGroup;
  title: string;
  subtitle: string | null;
  href: string;
};

/** Per-group cap, so one prolific category cannot crowd out the rest. */
const PER_GROUP = 5;

export async function searchEverything(
  userId: string,
  rawQuery: string,
): Promise<SearchResult[]> {
  const query = rawQuery.trim();
  if (query.length < 2) return [];

  const contains = { contains: query, mode: "insensitive" as const };

  const [interviews, assessments, problems, roadmapTasks, jobs, resumes] =
    await Promise.all([
      prisma.interview.findMany({
        where: { userId, targetRole: contains },
        orderBy: { createdAt: "desc" },
        take: PER_GROUP,
        select: {
          id: true,
          targetRole: true,
          type: true,
          status: true,
          report: { select: { overallScore: true } },
        },
      }),
      prisma.assessment.findMany({
        where: { isPublished: true, title: contains },
        orderBy: { createdAt: "desc" },
        take: PER_GROUP,
        select: { id: true, title: true, category: true, difficulty: true },
      }),
      prisma.codingProblem.findMany({
        where: {
          isPublished: true,
          OR: [{ title: contains }, { topic: contains }],
        },
        orderBy: { createdAt: "desc" },
        take: PER_GROUP,
        select: { id: true, slug: true, title: true, topic: true, difficulty: true },
      }),
      prisma.roadmapTask.findMany({
        where: { roadmap: { userId }, title: contains },
        orderBy: [{ day: "asc" }],
        take: PER_GROUP,
        select: {
          id: true,
          title: true,
          day: true,
          isCompleted: true,
          roadmapId: true,
        },
      }),
      prisma.jobDescription.findMany({
        where: {
          userId,
          OR: [{ title: contains }, { company: contains }],
        },
        orderBy: { createdAt: "desc" },
        take: PER_GROUP,
        select: { id: true, title: true, company: true, matchScore: true },
      }),
      prisma.resume.findMany({
        where: { userId, fileName: contains },
        orderBy: { createdAt: "desc" },
        take: PER_GROUP,
        select: { id: true, fileName: true, status: true },
      }),
    ]);

  const needle = query.toLowerCase();
  const skills = SKILL_GRAPH.filter((skill) =>
    skill.label.toLowerCase().includes(needle),
  ).slice(0, PER_GROUP);

  const results: SearchResult[] = [
    ...interviews.map((row) => ({
      id: `interview-${row.id}`,
      group: "Interviews" as const,
      title: row.targetRole,
      subtitle: row.report
        ? `${row.type} · scored ${row.report.overallScore}/100`
        : `${row.type} · ${row.status.toLowerCase().replace(/_/g, " ")}`,
      href: row.report ? `/interview/${row.id}/result` : `/interview/${row.id}`,
    })),
    ...assessments.map((row) => ({
      id: `assessment-${row.id}`,
      group: "Assessments" as const,
      title: row.title,
      subtitle: `${row.category} · ${row.difficulty}`,
      href: `/assessments/${row.id}`,
    })),
    ...problems.map((row) => ({
      id: `problem-${row.id}`,
      group: "Coding" as const,
      title: row.title,
      subtitle: `${row.topic} · ${row.difficulty}`,
      href: `/coding/${row.slug}`,
    })),
    ...skills.map((skill) => ({
      id: `skill-${skill.key}`,
      group: "Skills" as const,
      title: skill.label,
      subtitle: skill.description ?? "Skill intelligence",
      href: `/skills/${encodeURIComponent(skill.key)}`,
    })),
    ...roadmapTasks.map((row) => ({
      id: `task-${row.id}`,
      group: "Roadmap" as const,
      title: row.title,
      subtitle: `Day ${row.day}${row.isCompleted ? " · done" : ""}`,
      href: `/roadmap/${row.roadmapId}`,
    })),
    ...jobs.map((row) => ({
      id: `jd-${row.id}`,
      group: "Job matching" as const,
      title: row.title,
      subtitle: [row.company, row.matchScore ? `${row.matchScore}% match` : null]
        .filter(Boolean)
        .join(" · ") || null,
      href: `/job-description/${row.id}`,
    })),
    ...resumes.map((row) => ({
      id: `resume-${row.id}`,
      group: "Resume" as const,
      title: row.fileName,
      subtitle: row.status.toLowerCase().replace(/_/g, " "),
      href: "/resume",
    })),
  ];

  return results;
}
