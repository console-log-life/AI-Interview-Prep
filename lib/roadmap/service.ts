import "server-only";
import type { TaskKind } from "@prisma/client";

import { getAIService } from "@/lib/ai";
import { setAiUsageUser } from "@/lib/ai/observability";
import { NotFoundError, ValidationError } from "@/lib/api/errors";
import { buildGrounding } from "@/lib/analytics/service";
import { prisma } from "@/lib/db/prisma";
import { getRepeatedMistakes } from "@/lib/mistakes/service";
import { getWeakSkills } from "@/lib/skills/service";
import { utcDay } from "@/lib/utils";

/**
 * Roadmaps and the daily preparation plan.
 *
 * Two different things on purpose:
 *  - a Roadmap is a multi-week AI-generated plan the user opts into
 *  - a DailyPlan is regenerated every day from current weaknesses, and works
 *    with NO AI key at all (see `generateDailyPlan`)
 *
 * That split is what keeps "Today's plan" on the dashboard useful for a
 * deployment with no credentials.
 */

export const ALLOWED_HORIZONS = [7, 14, 30, 60, 90] as const;
export type Horizon = (typeof ALLOWED_HORIZONS)[number];

const ACTION_URL: Record<TaskKind, string> = {
  ASSESSMENT: "/assessments",
  INTERVIEW: "/interview/new",
  CODING: "/coding",
  STUDY: "/progress",
  RESUME: "/resume",
  REVIEW: "/progress",
};

export async function generateRoadmap(args: {
  userId: string;
  horizonDays: Horizon;
  minutesPerDay: number;
}) {
  if (!ALLOWED_HORIZONS.includes(args.horizonDays)) {
    throw new ValidationError("Choose a 7, 14, 30, 60 or 90 day plan.");
  }

  setAiUsageUser(args.userId);
  const grounding = await buildGrounding(args.userId);

  const ai = getAIService();
  const generated = await ai.generateRoadmap({
    grounding,
    horizonDays: args.horizonDays,
    minutesPerDay: args.minutesPerDay,
  });

  // Only one active plan at a time — competing plans are worse than none.
  await prisma.roadmap.updateMany({
    where: { userId: args.userId, isActive: true },
    data: { isActive: false },
  });

  return prisma.roadmap.create({
    data: {
      userId: args.userId,
      title: generated.title,
      summary: generated.summary,
      horizonDays: args.horizonDays,
      targetRole: grounding.targetRole,
      isActive: true,
      tasks: {
        create: generated.tasks.map((task, index) => ({
          day: task.day,
          title: task.title,
          detail: task.detail,
          kind: task.kind as TaskKind,
          topic: task.topic || null,
          estimatedMin: task.estimatedMin,
          actionUrl: ACTION_URL[task.kind as TaskKind] ?? null,
          order: index,
        })),
      },
    },
    select: { id: true },
  });
}

export async function getActiveRoadmap(userId: string) {
  return prisma.roadmap.findFirst({
    where: { userId, isActive: true },
    include: { tasks: { orderBy: [{ day: "asc" }, { order: "asc" }] } },
  });
}

/** One roadmap by id, ownership-scoped. */
export async function getRoadmap(userId: string, roadmapId: string) {
  const roadmap = await prisma.roadmap.findFirst({
    where: { id: roadmapId, userId },
    include: { tasks: { orderBy: [{ day: "asc" }, { order: "asc" }] } },
  });
  if (!roadmap) throw new NotFoundError("We could not find that roadmap.");
  return roadmap;
}

/**
 * Makes an older roadmap the active one again.
 *
 * Superseding a plan does not delete it — a candidate who generated a 30-day
 * plan, tried a 7-day sprint, and wants the longer plan back should not have
 * to pay for regeneration and lose their ticked-off tasks.
 */
export async function activateRoadmap(userId: string, roadmapId: string) {
  const owned = await prisma.roadmap.findFirst({
    where: { id: roadmapId, userId },
    select: { id: true },
  });
  if (!owned) throw new NotFoundError("We could not find that roadmap.");

  await prisma.$transaction([
    prisma.roadmap.updateMany({
      where: { userId, isActive: true },
      data: { isActive: false },
    }),
    prisma.roadmap.update({
      where: { id: roadmapId },
      data: { isActive: true },
    }),
  ]);

  return { id: roadmapId, isActive: true };
}

export async function listRoadmaps(userId: string) {
  return prisma.roadmap.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      title: true,
      horizonDays: true,
      isActive: true,
      createdAt: true,
      _count: { select: { tasks: true } },
    },
  });
}

export async function toggleRoadmapTask(
  userId: string,
  taskId: string,
  isCompleted: boolean,
) {
  // Ownership is enforced through the parent roadmap, not trusted from input.
  const task = await prisma.roadmapTask.findFirst({
    where: { id: taskId, roadmap: { userId } },
    select: { id: true },
  });
  if (!task) throw new NotFoundError("We could not find that task.");

  return prisma.roadmapTask.update({
    where: { id: taskId },
    data: {
      isCompleted,
      completedAt: isCompleted ? new Date() : null,
    },
  });
}

// ---------------------------------------------------------------------------
// Daily plan — rule-based, works with no AI key
// ---------------------------------------------------------------------------

type PlannedTask = {
  title: string;
  detail: string;
  kind: TaskKind;
  topic: string | null;
  skillKey: string | null;
  targetCount: number;
};

/**
 * Builds today's tasks from measured weaknesses.
 *
 * Deliberately deterministic and AI-free: the dashboard's "Today's plan" must
 * work on a deployment with no credentials, and a rule that says "you scored
 * 42% on SQL joins, do 5 SQL questions" needs no model to produce.
 */
export function buildDailyTasks(args: {
  weakSkills: Array<{ skillKey: string; label: string; score: number }>;
  repeatedMistakes: Array<{ label: string; concept: string; frequency: number }>;
  interviewsCompleted: number;
  problemsSolved: number;
  hasResume: boolean;
}): PlannedTask[] {
  const tasks: PlannedTask[] = [];

  // 1. Up to two weakest skills get a targeted drill.
  for (const skill of args.weakSkills.slice(0, 2)) {
    tasks.push({
      title: `${5} questions on ${skill.label}`,
      detail: `You are averaging ${Math.round(skill.score)}% here — the lowest of your measured areas.`,
      kind: "ASSESSMENT",
      topic: skill.label,
      skillKey: skill.skillKey,
      targetCount: 5,
    });
  }

  // 2. The most frequent repeated mistake gets an explicit review slot.
  const topMistake = args.repeatedMistakes[0];
  if (topMistake) {
    tasks.push({
      title: `Review: ${topMistake.label}`,
      detail: `This has come up ${topMistake.frequency} times. Fix the concept, then re-test it.`,
      kind: "REVIEW",
      topic: topMistake.label,
      skillKey: null,
      targetCount: 1,
    });
  }

  // 3. Always one coding problem — the highest-signal daily habit.
  tasks.push({
    title: "Solve 1 coding problem",
    detail:
      args.problemsSolved === 0
        ? "Start with an easy problem to establish a baseline."
        : "Pick one slightly above your current comfort level.",
    kind: "CODING",
    topic: null,
    skillKey: null,
    targetCount: 1,
  });

  // 4. A behavioural question, since these are the most-skipped and cheapest
  //    to improve.
  tasks.push({
    title: "Answer 1 behavioural question",
    detail: "Practise the STAR structure: Situation, Task, Action, Result.",
    kind: "STUDY",
    topic: "Behavioural",
    skillKey: "behavioral",
    targetCount: 1,
  });

  // 5. A mock interview, unless one has already been done recently enough
  //    that a fifth task would make the day unrealistic.
  if (args.interviewsCompleted < 3 || tasks.length < 5) {
    tasks.push({
      title:
        args.interviewsCompleted === 0
          ? "Run your first mock interview"
          : "Run a short mock interview",
      detail: "A 15-minute session produces scores across four categories.",
      kind: "INTERVIEW",
      topic: null,
      skillKey: null,
      targetCount: 1,
    });
  }

  // 6. Onboarding nudge only while it is still outstanding.
  if (!args.hasResume) {
    tasks.push({
      title: "Upload your resume",
      detail: "Interviews can then ask about your real projects.",
      kind: "RESUME",
      topic: null,
      skillKey: null,
      targetCount: 1,
    });
  }

  return tasks.slice(0, 6);
}

/** Returns today's plan, generating it on first access each day. */
export async function getOrCreateDailyPlan(userId: string) {
  const day = utcDay();

  const existing = await prisma.dailyPlan.findUnique({
    where: { userId_day: { userId, day } },
    include: { tasks: { orderBy: { order: "asc" } } },
  });
  if (existing) return existing;

  const [weakSkills, repeated, interviewsCompleted, solved, resumeCount] =
    await Promise.all([
      getWeakSkills(userId, 4),
      getRepeatedMistakes(userId, 3),
      prisma.interview.count({ where: { userId, status: "COMPLETED" } }),
      prisma.codingSubmission.findMany({
        where: { userId, status: "ACCEPTED", isRunOnly: false },
        select: { problemId: true },
        distinct: ["problemId"],
      }),
      prisma.resume.count({ where: { userId } }),
    ]);

  const planned = buildDailyTasks({
    weakSkills: weakSkills.map((skill) => ({
      skillKey: skill.skillKey,
      label: skill.label,
      score: skill.score,
    })),
    repeatedMistakes: repeated.map((mistake) => ({
      label: mistake.label,
      concept: mistake.concept,
      frequency: mistake.frequency,
    })),
    interviewsCompleted,
    problemsSolved: solved.length,
    hasResume: resumeCount > 0,
  });

  try {
    return await prisma.dailyPlan.create({
      data: {
        userId,
        day,
        tasks: {
          create: planned.map((task, index) => ({
            title: task.title,
            detail: task.detail,
            kind: task.kind,
            topic: task.topic,
            skillKey: task.skillKey,
            targetCount: task.targetCount,
            actionUrl: ACTION_URL[task.kind] ?? null,
            order: index,
          })),
        },
      },
      include: { tasks: { orderBy: { order: "asc" } } },
    });
  } catch {
    // Two parallel dashboard loads can race on the unique (userId, day).
    return prisma.dailyPlan.findUniqueOrThrow({
      where: { userId_day: { userId, day } },
      include: { tasks: { orderBy: { order: "asc" } } },
    });
  }
}

export async function toggleDailyTask(
  userId: string,
  taskId: string,
  isCompleted: boolean,
) {
  const task = await prisma.dailyPlanTask.findFirst({
    where: { id: taskId, plan: { userId } },
    select: { id: true },
  });
  if (!task) throw new NotFoundError("We could not find that task.");

  return prisma.dailyPlanTask.update({
    where: { id: taskId },
    data: { isCompleted, completedAt: isCompleted ? new Date() : null },
  });
}
