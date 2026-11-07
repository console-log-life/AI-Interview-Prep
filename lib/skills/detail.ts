import "server-only";

import { NotFoundError } from "@/lib/api/errors";
import { prisma } from "@/lib/db/prisma";
import { mistakePriority } from "@/lib/mistakes/detect";
import {
  ancestorsOf,
  childrenOf,
  getSkill,
  skillLabel,
} from "@/lib/skills/graph";
import {
  CONFIDENCE_LABEL,
  SKILL_ACTION_LABEL,
  confidenceBand,
  recommendedAction,
  type SkillAction,
} from "@/lib/skills/scoring";

/**
 * Everything the skill detail page shows.
 *
 * All of it is read back from rows the user's own activity produced. A skill
 * with no evidence returns a populated shell with zeroed counts rather than
 * throwing — "you have not practised this yet" is a legitimate answer and the
 * page renders it honestly.
 */

export type SkillEvidenceRow = {
  id: string;
  source: string;
  score: number;
  difficulty: string;
  observedAt: string;
};

export type SkillSubtopic = {
  skillKey: string;
  label: string;
  score: number;
  confidence: number;
  confidenceLabel: string;
  observations: number;
  trend: number;
  hasEvidence: boolean;
};

export type SkillMistakeRow = {
  id: string;
  label: string;
  severity: string;
  status: string;
  frequency: number;
  lastSeenAt: string;
};

export type SkillDetail = {
  skillKey: string;
  label: string;
  description: string | null;
  category: string;
  /** Root → … → this skill, for the breadcrumb trail on the page. */
  ancestors: Array<{ skillKey: string; label: string }>;
  score: number;
  confidence: number;
  confidenceLabel: string;
  trend: number;
  observations: number;
  lastPracticedAt: string | null;
  action: SkillAction;
  actionLabel: string;
  hasEvidence: boolean;
  subtopics: SkillSubtopic[];
  weakSubtopics: SkillSubtopic[];
  recentEvidence: SkillEvidenceRow[];
  mistakes: SkillMistakeRow[];
  /** Open review-queue items covering this skill. */
  dueReviews: number;
  /** Today's plan tasks that target this skill. */
  plannedTasks: Array<{ id: string; title: string; isCompleted: boolean }>;
};

export async function getSkillDetail(
  userId: string,
  skillKey: string,
): Promise<SkillDetail> {
  const definition = getSkill(skillKey);
  if (!definition) {
    throw new NotFoundError("We could not find that skill.");
  }

  const children = childrenOf(skillKey);
  const childKeys = children.map((child) => child.key);

  const [profile, childProfiles, observations, mistakes, dueReviews, planTasks] =
    await Promise.all([
      prisma.skillProfile.findUnique({
        where: { userId_skillKey: { userId, skillKey } },
      }),
      childKeys.length > 0
        ? prisma.skillProfile.findMany({
            where: { userId, skillKey: { in: childKeys } },
          })
        : Promise.resolve([]),
      prisma.skillObservation.findMany({
        where: { userId, skillKey },
        orderBy: { observedAt: "desc" },
        take: 12,
        select: {
          id: true,
          source: true,
          score: true,
          difficulty: true,
          observedAt: true,
        },
      }),
      prisma.mistake.findMany({
        where: { userId, skillKey, status: { not: "RESOLVED" } },
        take: 10,
        select: {
          id: true,
          label: true,
          severity: true,
          status: true,
          frequency: true,
          lastSeenAt: true,
        },
      }),
      prisma.reviewItem.count({
        where: {
          userId,
          isActive: true,
          skillKey,
          dueAt: { lte: new Date() },
        },
      }),
      prisma.dailyPlanTask.findMany({
        where: { skillKey, plan: { userId } },
        orderBy: { order: "asc" },
        take: 5,
        select: { id: true, title: true, isCompleted: true },
      }),
    ]);

  const byKey = new Map(childProfiles.map((row) => [row.skillKey, row]));

  const subtopics: SkillSubtopic[] = children
    .map((child) => {
      const row = byKey.get(child.key);
      const confidence = row?.confidence ?? 0;
      return {
        skillKey: child.key,
        label: child.label,
        score: row?.score ?? 0,
        confidence,
        confidenceLabel: CONFIDENCE_LABEL[confidenceBand(confidence)],
        observations: row?.observations ?? 0,
        trend: row?.trend ?? 0,
        hasEvidence: (row?.observations ?? 0) > 0,
      };
    })
    .sort((a, b) => {
      // Measured subtopics first, weakest at the top; untouched ones last.
      if (a.hasEvidence !== b.hasEvidence) return a.hasEvidence ? -1 : 1;
      return a.score - b.score;
    });

  const score = profile?.score ?? 0;
  const confidence = profile?.confidence ?? 0;

  return {
    skillKey,
    label: definition.label,
    description: definition.description ?? null,
    category: definition.category,
    ancestors: ancestorsOf(skillKey)
      .slice(1)
      .reverse()
      .map((key) => ({ skillKey: key, label: skillLabel(key) })),
    score,
    confidence,
    confidenceLabel: CONFIDENCE_LABEL[confidenceBand(confidence)],
    trend: profile?.trend ?? 0,
    observations: profile?.observations ?? 0,
    lastPracticedAt: profile?.lastPracticedAt?.toISOString() ?? null,
    action: recommendedAction(score, confidence),
    actionLabel: SKILL_ACTION_LABEL[recommendedAction(score, confidence)],
    hasEvidence: (profile?.observations ?? 0) > 0,
    subtopics,
    weakSubtopics: subtopics.filter(
      (subtopic) => subtopic.hasEvidence && subtopic.score < 60,
    ),
    recentEvidence: observations.map((row) => ({
      id: row.id,
      source: row.source,
      score: Math.round(row.score),
      difficulty: row.difficulty,
      observedAt: row.observedAt.toISOString(),
    })),
    mistakes: mistakes
      .map((row) => ({
        id: row.id,
        label: row.label,
        severity: row.severity,
        status: row.status,
        frequency: row.frequency,
        lastSeenAt: row.lastSeenAt.toISOString(),
        priority: mistakePriority({
          frequency: row.frequency,
          severity: row.severity,
          status: row.status,
        }),
      }))
      .sort((a, b) => b.priority - a.priority)
      .map(({ priority: _priority, ...row }) => row),
    dueReviews,
    plannedTasks: planTasks,
  };
}
