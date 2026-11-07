import "server-only";
import type { ReviewItemKind } from "@prisma/client";

import { NotFoundError } from "@/lib/api/errors";
import { prisma } from "@/lib/db/prisma";
import {
  partitionQueue,
  selectNewEnrolments,
  type EnrolmentCandidate,
} from "@/lib/practice/queue";
import {
  DEFAULT_EASE,
  applyReview,
  nextDueDate,
  previewIntervals,
  type ReviewQuality,
  type ReviewState,
} from "@/lib/practice/scheduling";
import { skillLabel } from "@/lib/skills/graph";

/**
 * Spaced practice.
 *
 * Enrolment is automatic and comes from evidence the platform already has:
 * a mistake that has recurred, or a skill measured weak with enough
 * confidence to trust. Nothing here asks the candidate to build their own
 * deck — the whole point is that the system already knows what they keep
 * getting wrong.
 *
 * Reviews are self-graded. That is real user input, not a fabricated signal,
 * and the UI labels it as self-assessment rather than presenting it as a
 * measured score.
 */

/** A mistake must have recurred before it earns a place in the queue. */
const MISTAKE_ENROL_FREQUENCY = 2;
/** Weak-skill enrolment thresholds — mirror `getWeakSkills`. */
const SKILL_ENROL_SCORE = 60;
const SKILL_ENROL_CONFIDENCE = 0.15;

function toState(row: {
  intervalDays: number;
  ease: number;
  reviewCount: number;
  lapses: number;
}): ReviewState {
  return {
    intervalDays: row.intervalDays,
    ease: row.ease,
    reviewCount: row.reviewCount,
    lapses: row.lapses,
  };
}

/**
 * Enrols repeated mistakes and confirmed weak skills.
 *
 * Idempotent: re-running only adds what is missing and never resets the
 * schedule of an item already being reviewed. Called opportunistically when
 * the review queue is read, so there is no cron dependency.
 */
export async function syncReviewItems(userId: string): Promise<number> {
  const [repeated, weakSkills, existing] = await Promise.all([
    prisma.mistake.findMany({
      where: {
        userId,
        status: { not: "RESOLVED" },
        frequency: { gte: MISTAKE_ENROL_FREQUENCY },
      },
      select: { id: true, concept: true, label: true, skillKey: true },
    }),
    prisma.skillProfile.findMany({
      where: {
        userId,
        observations: { gt: 0 },
        score: { lt: SKILL_ENROL_SCORE },
        confidence: { gte: SKILL_ENROL_CONFIDENCE },
      },
      select: { skillKey: true },
      take: 20,
    }),
    prisma.reviewItem.findMany({
      where: { userId },
      select: { kind: true, refKey: true },
    }),
  ]);

  const candidates: EnrolmentCandidate[] = [
    ...repeated.map((mistake) => ({
      kind: "MISTAKE" as const,
      refKey: mistake.concept,
      label: mistake.label,
      mistakeId: mistake.id,
      skillKey: mistake.skillKey,
    })),
    ...weakSkills.map((skill) => ({
      kind: "SKILL" as const,
      refKey: skill.skillKey,
      label: skillLabel(skill.skillKey),
      mistakeId: null,
      skillKey: skill.skillKey,
    })),
  ];

  const fresh = selectNewEnrolments(candidates, existing);
  if (fresh.length === 0) return 0;

  // New items are due immediately — the candidate is already weak at them.
  // `skipDuplicates` is a second guard behind the unique constraint, for the
  // case where two requests sync the same user concurrently.
  const created = await prisma.reviewItem.createMany({
    data: fresh.map((candidate) => ({
      userId,
      kind: candidate.kind,
      refKey: candidate.refKey,
      label: candidate.label,
      mistakeId: candidate.mistakeId,
      skillKey: candidate.skillKey,
      ease: DEFAULT_EASE,
    })),
    skipDuplicates: true,
  });

  return created.count;
}

export type ReviewItemView = {
  id: string;
  kind: ReviewItemKind;
  refKey: string;
  label: string;
  skillKey: string | null;
  skillLabel: string | null;
  intervalDays: number;
  reviewCount: number;
  lapses: number;
  dueAt: string;
  isDue: boolean;
  daysOverdue: number;
  lastReviewedAt: string | null;
  /** What each grade would schedule next, in days. */
  intervals: Record<ReviewQuality, number>;
  /** Where to actually go and practise this. */
  actionUrl: string;
};

function toView(
  row: {
    id: string;
    kind: ReviewItemKind;
    refKey: string;
    label: string;
    skillKey: string | null;
    intervalDays: number;
    ease: number;
    reviewCount: number;
    lapses: number;
    dueAt: Date;
    lastReviewedAt: Date | null;
  },
  now: Date,
): ReviewItemView {
  const daysOverdue = Math.floor(
    (now.getTime() - row.dueAt.getTime()) / 86_400_000,
  );

  return {
    id: row.id,
    kind: row.kind,
    refKey: row.refKey,
    label: row.label,
    skillKey: row.skillKey,
    skillLabel: row.skillKey ? skillLabel(row.skillKey) : null,
    intervalDays: row.intervalDays,
    reviewCount: row.reviewCount,
    lapses: row.lapses,
    dueAt: row.dueAt.toISOString(),
    isDue: row.dueAt.getTime() <= now.getTime(),
    daysOverdue: Math.max(0, daysOverdue),
    lastReviewedAt: row.lastReviewedAt?.toISOString() ?? null,
    intervals: previewIntervals(toState(row)),
    // Interviews are the highest-signal way to re-test a concept; skills
    // with a graph key can be drilled with a targeted assessment instead.
    actionUrl: row.skillKey ? "/assessments" : "/interview/new",
  };
}

export type ReviewQueue = {
  due: ReviewItemView[];
  upcoming: ReviewItemView[];
  /** Due items in total, which may exceed the number returned. */
  dueTotal: number;
  totalActive: number;
  enrolled: number;
};

/**
 * The review queue.
 *
 * Syncs enrolment first so a mistake that recurred this morning is available
 * this afternoon without waiting for a scheduled job.
 */
export async function getReviewQueue(
  userId: string,
  { dueLimit = 10, upcomingLimit = 5 } = {},
): Promise<ReviewQueue> {
  const enrolled = await syncReviewItems(userId);
  const now = new Date();

  const items = await prisma.reviewItem.findMany({
    where: { userId, isActive: true },
    orderBy: { dueAt: "asc" },
    take: 100,
  });

  const { due, upcoming } = partitionQueue(items, now);

  return {
    due: due.slice(0, dueLimit).map((item) => toView(item, now)),
    upcoming: upcoming.slice(0, upcomingLimit).map((item) => toView(item, now)),
    dueTotal: due.length,
    totalActive: items.length,
    enrolled,
  };
}

/**
 * Records a self-graded review and reschedules the item.
 *
 * Ownership is enforced in the `where` clause, so an id from another account
 * simply does not resolve.
 */
export async function recordReview(args: {
  userId: string;
  reviewItemId: string;
  quality: ReviewQuality;
}): Promise<ReviewItemView> {
  const item = await prisma.reviewItem.findFirst({
    where: { id: args.reviewItemId, userId: args.userId },
  });
  if (!item) throw new NotFoundError("We could not find that review item.");

  const next = applyReview(toState(item), args.quality);
  const now = new Date();
  const dueAt = nextDueDate(next, now);

  const [updated] = await prisma.$transaction([
    prisma.reviewItem.update({
      where: { id: item.id },
      data: {
        intervalDays: next.intervalDays,
        ease: next.ease,
        reviewCount: next.reviewCount,
        lapses: next.lapses,
        dueAt,
        lastReviewedAt: now,
        lastQuality: args.quality,
      },
    }),
    prisma.reviewLog.create({
      data: {
        reviewItemId: item.id,
        quality: args.quality,
        intervalDays: next.intervalDays,
        ease: next.ease,
      },
    }),
  ]);

  return toView(updated, now);
}

/**
 * Retires an item from the queue.
 *
 * Kept rather than deleted: the review history is evidence of work done, and
 * a concept that resurfaces later should re-enrol with that history intact.
 */
export async function retireReviewItem(userId: string, reviewItemId: string) {
  const item = await prisma.reviewItem.findFirst({
    where: { id: reviewItemId, userId },
    select: { id: true },
  });
  if (!item) throw new NotFoundError("We could not find that review item.");

  return prisma.reviewItem.update({
    where: { id: reviewItemId },
    data: { isActive: false },
    select: { id: true, isActive: true },
  });
}

/** Count of items due right now — cheap enough for the dashboard badge. */
export async function countDueReviews(userId: string): Promise<number> {
  return prisma.reviewItem.count({
    where: { userId, isActive: true, dueAt: { lte: new Date() } },
  });
}
