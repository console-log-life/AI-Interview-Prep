import "server-only";
import type { EvidenceSource } from "@prisma/client";

import { NotFoundError } from "@/lib/api/errors";
import { prisma } from "@/lib/db/prisma";
import { resolveSkillKey, skillLabel } from "@/lib/skills/graph";
import {
  detectMistakes,
  evaluateMistakeStatus,
  mistakePriority,
  type DetectedMistake,
} from "@/lib/mistakes/detect";

/**
 * Persistent mistake memory.
 *
 * `Mistake` is unique on (userId, concept), so the second occurrence of the
 * same conceptual error increments a counter instead of creating a new row.
 * That single constraint is what makes "repeated mistake detected" possible.
 */

export async function recordMistakes(args: {
  userId: string;
  source: EvidenceSource;
  sourceId: string;
  topic?: string | null;
  score: number;
  missingPoints: string[];
}): Promise<DetectedMistake[]> {
  const detected = detectMistakes({
    score: args.score,
    missingPoints: args.missingPoints,
  });
  if (detected.length === 0) return [];

  const skillKey = args.topic ? resolveSkillKey(args.topic) : null;
  const now = new Date();

  for (const mistake of detected) {
    const existing = await prisma.mistake.findUnique({
      where: { userId_concept: { userId: args.userId, concept: mistake.concept } },
      select: { id: true, frequency: true },
    });

    const record = existing
      ? await prisma.mistake.update({
          where: { id: existing.id },
          data: {
            frequency: { increment: 1 },
            lastSeenAt: now,
            // A recurrence reopens something previously marked resolved.
            status: "ACTIVE",
            resolvedAt: null,
            severity: mistake.severity,
            ...(skillKey ? { skillKey } : {}),
          },
          select: { id: true },
        })
      : await prisma.mistake.create({
          data: {
            userId: args.userId,
            concept: mistake.concept,
            label: mistake.label,
            severity: mistake.severity,
            skillKey,
            firstSeenAt: now,
            lastSeenAt: now,
          },
          select: { id: true },
        });

    await prisma.mistakeOccurrence.create({
      data: {
        mistakeId: record.id,
        source: args.source,
        sourceId: args.sourceId,
        detail: mistake.detail,
      },
    });
  }

  return detected;
}

/**
 * Ages mistakes that have not recurred.
 *
 * Called on dashboard load rather than by a cron job — this project has no
 * scheduler, and the computation is cheap and idempotent.
 */
export async function refreshMistakeStatuses(userId: string): Promise<void> {
  const mistakes = await prisma.mistake.findMany({
    where: { userId, status: { not: "RESOLVED" } },
    select: { id: true, frequency: true, lastSeenAt: true, status: true },
  });

  const now = new Date();

  await Promise.all(
    mistakes.map((mistake) => {
      const next = evaluateMistakeStatus({
        frequency: mistake.frequency,
        lastSeenAt: mistake.lastSeenAt,
        now,
      });
      if (next === mistake.status) return null;
      return prisma.mistake.update({
        where: { id: mistake.id },
        data: {
          status: next,
          resolvedAt: next === "RESOLVED" ? now : null,
        },
      });
    }),
  );
}

export type MistakeRow = {
  id: string;
  concept: string;
  label: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  status: "ACTIVE" | "IMPROVING" | "RESOLVED";
  frequency: number;
  skillKey: string | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  isRepeated: boolean;
  priority: number;
  latestDetail: string | null;
};

export async function getMistakes(
  userId: string,
  { includeResolved = false, limit = 20 } = {},
): Promise<MistakeRow[]> {
  const rows = await prisma.mistake.findMany({
    where: {
      userId,
      ...(includeResolved ? {} : { status: { not: "RESOLVED" } }),
    },
    include: {
      occurrences: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { detail: true },
      },
    },
    orderBy: [{ frequency: "desc" }, { lastSeenAt: "desc" }],
    take: limit,
  });

  return rows
    .map((row) => ({
      id: row.id,
      concept: row.concept,
      label: row.label,
      severity: row.severity,
      status: row.status,
      frequency: row.frequency,
      skillKey: row.skillKey,
      firstSeenAt: row.firstSeenAt,
      lastSeenAt: row.lastSeenAt,
      isRepeated: row.frequency > 1,
      priority: mistakePriority({
        frequency: row.frequency,
        severity: row.severity,
        status: row.status,
      }),
      latestDetail: row.occurrences[0]?.detail ?? null,
    }))
    .sort((a, b) => b.priority - a.priority);
}

/** Mistakes seen more than once — the headline "repeated mistake" list. */
export async function getRepeatedMistakes(userId: string, limit = 5) {
  const all = await getMistakes(userId, { limit: 50 });
  return all.filter((mistake) => mistake.isRepeated).slice(0, limit);
}

export type MistakeTimeline = {
  id: string;
  label: string;
  concept: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  status: "ACTIVE" | "IMPROVING" | "RESOLVED";
  frequency: number;
  skillKey: string | null;
  skillLabel: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  daysSinceLastSeen: number;
  occurrences: Array<{
    id: string;
    source: string;
    detail: string;
    createdAt: string;
  }>;
};

/**
 * The full history of one mistake.
 *
 * Ownership is enforced in the `where` clause — a mistake id from another
 * account simply does not resolve, so the caller cannot enumerate them.
 */
export async function getMistakeTimeline(
  userId: string,
  mistakeId: string,
): Promise<MistakeTimeline> {
  const mistake = await prisma.mistake.findFirst({
    where: { id: mistakeId, userId },
    include: { occurrences: { orderBy: { createdAt: "desc" }, take: 50 } },
  });

  if (!mistake) throw new NotFoundError("We could not find that mistake.");

  return {
    id: mistake.id,
    label: mistake.label,
    concept: mistake.concept,
    severity: mistake.severity,
    status: mistake.status,
    frequency: mistake.frequency,
    skillKey: mistake.skillKey,
    skillLabel: mistake.skillKey ? skillLabel(mistake.skillKey) : null,
    firstSeenAt: mistake.firstSeenAt.toISOString(),
    lastSeenAt: mistake.lastSeenAt.toISOString(),
    daysSinceLastSeen: Math.max(
      0,
      Math.floor((Date.now() - mistake.lastSeenAt.getTime()) / 86_400_000),
    ),
    occurrences: mistake.occurrences.map((occurrence) => ({
      id: occurrence.id,
      source: occurrence.source,
      detail: occurrence.detail,
      createdAt: occurrence.createdAt.toISOString(),
    })),
  };
}
