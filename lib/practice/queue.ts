import type { ReviewItemKind } from "@prisma/client";

import { reviewPriority } from "@/lib/practice/scheduling";

/**
 * Queue assembly — pure functions, no I/O.
 *
 * Split out of the service so the two rules that actually matter can be
 * tested without a database:
 *
 *  1. Enrolment is idempotent. Re-running it must add only what is missing,
 *     and must never reset the schedule of an item already under review.
 *  2. The queue is ordered by how badly a concept is being forgotten, not
 *     merely by date — twenty due items are useless if the worst one is
 *     twentieth.
 */

export type EnrolmentCandidate = {
  kind: ReviewItemKind;
  refKey: string;
  label: string;
  mistakeId: string | null;
  skillKey: string | null;
};

export type ExistingItem = {
  kind: ReviewItemKind;
  refKey: string;
};

/** Composite identity of a review item — mirrors the DB unique constraint. */
export function itemKey(item: { kind: ReviewItemKind; refKey: string }): string {
  return `${item.kind}:${item.refKey}`;
}

/**
 * Which candidates are genuinely new.
 *
 * A candidate already present is skipped rather than updated: its schedule is
 * live, and overwriting the label or ease would silently undo the candidate's
 * review history.
 */
export function selectNewEnrolments(
  candidates: EnrolmentCandidate[],
  existing: ExistingItem[],
): EnrolmentCandidate[] {
  const known = new Set(existing.map(itemKey));
  const seen = new Set<string>();
  const fresh: EnrolmentCandidate[] = [];

  for (const candidate of candidates) {
    const key = itemKey(candidate);
    // Guard against duplicates *within* the candidate list too — a skill and
    // a mistake can resolve to the same refKey only if kinds differ, but two
    // mistakes sharing a concept slug would violate the unique constraint.
    if (known.has(key) || seen.has(key)) continue;
    seen.add(key);
    fresh.push(candidate);
  }

  return fresh;
}

export type SchedulableItem = {
  dueAt: Date;
  lapses: number;
};

/** Due now, worst-forgotten first. */
export function partitionQueue<T extends SchedulableItem>(
  items: T[],
  now: Date,
): { due: T[]; upcoming: T[] } {
  const due: T[] = [];
  const upcoming: T[] = [];

  for (const item of items) {
    if (item.dueAt.getTime() <= now.getTime()) due.push(item);
    else upcoming.push(item);
  }

  due.sort(
    (a, b) =>
      reviewPriority({ dueAt: b.dueAt, lapses: b.lapses, now }) -
      reviewPriority({ dueAt: a.dueAt, lapses: a.lapses, now }),
  );

  // Upcoming is chronological — "what's next" is the only useful order here.
  upcoming.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());

  return { due, upcoming };
}
