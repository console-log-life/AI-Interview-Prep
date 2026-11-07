import "server-only";
import type { Difficulty, EvidenceSource, Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import {
  ancestorsOf,
  resolveSkillKey,
  skillLabel,
  ROOT_SKILL_KEYS,
} from "@/lib/skills/graph";
import {
  computeSkillScore,
  confidenceBand,
  recommendedAction,
  SOURCE_WEIGHT,
  type Observation,
  type SkillScore,
} from "@/lib/skills/scoring";

/**
 * Bridges the pure scoring logic to the database.
 *
 * Recording an observation propagates it UP the skill graph — an answer about
 * "SQL joins" is evidence for `dbms.joins` and, more weakly, for `dbms`. That
 * is what lets the dashboard show twelve meaningful headline skills without
 * requiring the user to practise each one directly.
 */

export type RecordObservationInput = {
  userId: string;
  /** Free-text topic; resolved onto the skill graph. */
  topic: string;
  category?: Prisma.QuestionCreateInput["category"] | null;
  /** Normalised 0-100. */
  score: number;
  source: EvidenceSource;
  sourceId: string;
  difficulty?: Difficulty;
  observedAt?: Date;
};

/** Ancestors carry less weight than the leaf that was actually tested. */
const ANCESTOR_DECAY = 0.55;

export async function recordSkillObservations(
  inputs: RecordObservationInput[],
): Promise<void> {
  if (inputs.length === 0) return;

  const rows: Prisma.SkillObservationCreateManyInput[] = [];
  const touched = new Map<string, Set<string>>();

  for (const input of inputs) {
    const leafKey = resolveSkillKey(input.topic, input.category ?? null);
    if (!leafKey) continue;

    const chain = ancestorsOf(leafKey);
    const baseWeight = SOURCE_WEIGHT[input.source] ?? 1;

    chain.forEach((skillKey, depth) => {
      rows.push({
        userId: input.userId,
        skillKey,
        source: input.source,
        sourceId: input.sourceId,
        score: clamp(input.score),
        weight: baseWeight * Math.pow(ANCESTOR_DECAY, depth),
        difficulty: input.difficulty ?? "MEDIUM",
        observedAt: input.observedAt ?? new Date(),
      });

      const set = touched.get(input.userId) ?? new Set<string>();
      set.add(skillKey);
      touched.set(input.userId, set);
    });
  }

  if (rows.length === 0) return;

  // `skipDuplicates` guards against a retried request double-counting.
  await prisma.skillObservation.createMany({ data: rows, skipDuplicates: true });

  for (const [userId, keys] of touched) {
    await recomputeSkillProfiles(userId, [...keys]);
  }
}

/**
 * Rebuilds the derived `SkillProfile` rollups from the observation ledger.
 *
 * Always recomputed from raw observations rather than incrementally patched,
 * so changing the scoring algorithm only requires re-running this.
 */
export async function recomputeSkillProfiles(
  userId: string,
  skillKeys?: string[],
): Promise<void> {
  const where: Prisma.SkillObservationWhereInput = {
    userId,
    ...(skillKeys?.length ? { skillKey: { in: skillKeys } } : {}),
  };

  const observations = await prisma.skillObservation.findMany({
    where,
    select: {
      skillKey: true,
      score: true,
      weight: true,
      difficulty: true,
      observedAt: true,
    },
    // Bound the window so one prolific user cannot make this unbounded.
    orderBy: { observedAt: "desc" },
    take: 5000,
  });

  const grouped = new Map<string, Observation[]>();
  for (const row of observations) {
    const list = grouped.get(row.skillKey) ?? [];
    list.push({
      score: row.score,
      weight: row.weight,
      difficulty: row.difficulty,
      observedAt: row.observedAt,
    });
    grouped.set(row.skillKey, list);
  }

  const now = new Date();

  await Promise.all(
    [...grouped.entries()].map(([skillKey, list]) => {
      const computed = computeSkillScore(list, now);
      const data = {
        score: computed.score,
        confidence: computed.confidence,
        trend: computed.trend,
        observations: computed.observations,
        lastPracticedAt: computed.lastPracticedAt,
      };
      return prisma.skillProfile.upsert({
        where: { userId_skillKey: { userId, skillKey } },
        create: { userId, skillKey, ...data },
        update: data,
      });
    }),
  );
}

export type SkillIntelligenceRow = SkillScore & {
  skillKey: string;
  label: string;
  confidenceBand: ReturnType<typeof confidenceBand>;
  action: ReturnType<typeof recommendedAction>;
  isRoot: boolean;
};

/** The twelve headline skills for the dashboard, including untouched ones. */
export async function getHeadlineSkills(
  userId: string,
): Promise<SkillIntelligenceRow[]> {
  const profiles = await prisma.skillProfile.findMany({
    where: { userId, skillKey: { in: ROOT_SKILL_KEYS } },
  });
  const byKey = new Map(profiles.map((profile) => [profile.skillKey, profile]));

  return ROOT_SKILL_KEYS.map((skillKey) => {
    const profile = byKey.get(skillKey);
    const score = profile?.score ?? 0;
    const confidence = profile?.confidence ?? 0;
    return {
      skillKey,
      label: skillLabel(skillKey),
      score,
      confidence,
      trend: profile?.trend ?? 0,
      observations: profile?.observations ?? 0,
      lastPracticedAt: profile?.lastPracticedAt ?? null,
      confidenceBand: confidenceBand(confidence),
      action: recommendedAction(score, confidence),
      isRoot: true,
    };
  }).sort((a, b) => b.confidence - a.confidence || b.score - a.score);
}

/** Every skill with recorded evidence, weakest first. */
export async function getAllSkills(
  userId: string,
): Promise<SkillIntelligenceRow[]> {
  const profiles = await prisma.skillProfile.findMany({
    where: { userId, observations: { gt: 0 } },
    orderBy: { score: "asc" },
    take: 200,
  });

  return profiles.map((profile) => ({
    skillKey: profile.skillKey,
    label: skillLabel(profile.skillKey),
    score: profile.score,
    confidence: profile.confidence,
    trend: profile.trend,
    observations: profile.observations,
    lastPracticedAt: profile.lastPracticedAt,
    confidenceBand: confidenceBand(profile.confidence),
    action: recommendedAction(profile.score, profile.confidence),
    isRoot: ROOT_SKILL_KEYS.includes(profile.skillKey),
  }));
}

/**
 * Weak skills worth acting on.
 *
 * Requires a minimum confidence — a 30% score from one observation is noise,
 * not a weakness, and recommending against it would waste the user's time.
 */
export async function getWeakSkills(
  userId: string,
  limit = 6,
  { minConfidence = 0.15, threshold = 60 } = {},
): Promise<SkillIntelligenceRow[]> {
  const all = await getAllSkills(userId);
  return all
    .filter(
      (skill) => skill.score < threshold && skill.confidence >= minConfidence,
    )
    .slice(0, limit);
}

export async function getStrongSkills(
  userId: string,
  limit = 6,
): Promise<SkillIntelligenceRow[]> {
  const all = await getAllSkills(userId);
  return all
    .filter((skill) => skill.score >= 75 && skill.confidence >= 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function clamp(value: number, min = 0, max = 100): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
