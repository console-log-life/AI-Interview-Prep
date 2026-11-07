/**
 * Spaced-repetition scheduling — pure functions, no I/O.
 *
 * An SM-2 variant, deliberately simplified. The full algorithm's six-point
 * quality scale asks a candidate to distinguish "correct after hesitation"
 * from "correct with serious difficulty", which nobody grades consistently.
 * Four buttons they will actually use produce better data than six they
 * won't.
 *
 * What is preserved from SM-2: the ease factor adapts per item, so a concept
 * a candidate keeps forgetting comes back faster than one they merely find
 * dull, and lapses shorten the interval rather than resetting the history.
 */

export type ReviewQuality = "AGAIN" | "HARD" | "GOOD" | "EASY";

export type ReviewState = {
  /** Days until the next review. 0 means it has never been scheduled. */
  intervalDays: number;
  /** SM-2 ease factor. Higher = intervals grow faster. */
  ease: number;
  /** Successful reviews so far. */
  reviewCount: number;
  /** Times the candidate failed a review after previously passing it. */
  lapses: number;
};

export const DEFAULT_EASE = 2.5;
export const MIN_EASE = 1.3;
export const MAX_EASE = 3.2;

/** First two intervals are fixed — an ease factor means nothing yet. */
export const FIRST_INTERVAL_DAYS = 1;
export const SECOND_INTERVAL_DAYS = 3;

/**
 * Nothing is scheduled beyond this. A six-month gap on interview prep is
 * indistinguishable from "never again", and the candidate's target role will
 * have moved on by then.
 */
export const MAX_INTERVAL_DAYS = 120;

const EASE_DELTA: Record<ReviewQuality, number> = {
  AGAIN: -0.2,
  HARD: -0.15,
  GOOD: 0,
  EASY: 0.15,
};

export const INITIAL_REVIEW_STATE: ReviewState = {
  intervalDays: 0,
  ease: DEFAULT_EASE,
  reviewCount: 0,
  lapses: 0,
};

export function createReviewState(
  overrides: Partial<ReviewState> = {},
): ReviewState {
  return { ...INITIAL_REVIEW_STATE, ...overrides };
}

/**
 * Folds one graded review into the schedule.
 *
 * `AGAIN` always returns the item to a one-day interval: the point of the
 * schedule is that a forgotten concept comes back tomorrow, not next week.
 */
export function applyReview(
  state: ReviewState,
  quality: ReviewQuality,
): ReviewState {
  const ease = clamp(state.ease + EASE_DELTA[quality], MIN_EASE, MAX_EASE);

  if (quality === "AGAIN") {
    return {
      intervalDays: FIRST_INTERVAL_DAYS,
      ease,
      // A failure does not erase the history — reviewCount is a record of
      // work done, and resetting it would hide a genuinely hard concept.
      reviewCount: state.reviewCount,
      lapses: state.lapses + (state.reviewCount > 0 ? 1 : 0),
    };
  }

  const reviewCount = state.reviewCount + 1;
  const intervalDays = nextInterval(state, quality, ease, reviewCount);

  return { intervalDays, ease, reviewCount, lapses: state.lapses };
}

function nextInterval(
  state: ReviewState,
  quality: Exclude<ReviewQuality, "AGAIN">,
  ease: number,
  reviewCount: number,
): number {
  if (reviewCount === 1) return FIRST_INTERVAL_DAYS;
  if (reviewCount === 2) {
    return quality === "HARD" ? FIRST_INTERVAL_DAYS + 1 : SECOND_INTERVAL_DAYS;
  }

  const base = Math.max(state.intervalDays, FIRST_INTERVAL_DAYS);
  const multiplier =
    quality === "HARD" ? 1.2 : quality === "EASY" ? ease * 1.3 : ease;

  return clamp(Math.round(base * multiplier), FIRST_INTERVAL_DAYS, MAX_INTERVAL_DAYS);
}

/** When the next review falls due. */
export function nextDueDate(
  state: ReviewState,
  from: Date = new Date(),
): Date {
  const days = Math.max(FIRST_INTERVAL_DAYS, state.intervalDays);
  return new Date(from.getTime() + days * 86_400_000);
}

export function isDue(dueAt: Date, now: Date = new Date()): boolean {
  return dueAt.getTime() <= now.getTime();
}

/**
 * Ordering for the review queue.
 *
 * Most overdue first, then the items being forgotten most often. A candidate
 * with twenty due items should meet the one they have failed four times
 * before the one they have failed once.
 */
export function reviewPriority(args: {
  dueAt: Date;
  lapses: number;
  now?: Date;
}): number {
  const now = args.now ?? new Date();
  const daysOverdue = (now.getTime() - args.dueAt.getTime()) / 86_400_000;
  return Math.max(0, daysOverdue) + args.lapses * 2;
}

export const QUALITY_LABEL: Record<ReviewQuality, string> = {
  AGAIN: "Couldn't recall",
  HARD: "Struggled",
  GOOD: "Recalled it",
  EASY: "Easy",
};

/** Human-readable preview of when each button would bring the item back. */
export function previewIntervals(
  state: ReviewState,
): Record<ReviewQuality, number> {
  return {
    AGAIN: applyReview(state, "AGAIN").intervalDays,
    HARD: applyReview(state, "HARD").intervalDays,
    GOOD: applyReview(state, "GOOD").intervalDays,
    EASY: applyReview(state, "EASY").intervalDays,
  };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
