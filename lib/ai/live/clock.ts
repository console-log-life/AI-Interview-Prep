/**
 * The interview clock — pure, so the arithmetic can be tested.
 *
 * This exists because of a real bug seen in a browser: the room showed
 * "108:54 elapsed / 00:00 left" during a live, working interview with a
 * 20-minute budget. The cause was the anchor, not the display. `Interview.
 * startedAt` is when the *row* was created, and a candidate who configures an
 * interview and joins later — or resumes one from yesterday — is hours past
 * that before they say a word.
 *
 * So the clock is anchored on `liveStartedAt`, set when the candidate actually
 * joins, and until that exists the room reports that it is not yet running
 * rather than inventing a number.
 */

export type InterviewClock = {
  /** True once the live session has a real anchor. */
  anchored: boolean;
  elapsedMs: number;
  /** Null when the interview has no duration budget. */
  remainingMs: number | null;
  /** The budget is spent. */
  expired: boolean;
};

export const NOT_STARTED: InterviewClock = {
  anchored: false,
  elapsedMs: 0,
  remainingMs: null,
  expired: false,
};

export function interviewClock(input: {
  /** Epoch ms the live session began. Null before the candidate joins. */
  liveStartedAtMs: number | null;
  /** Budget in minutes. Null or 0 means no budget is displayed. */
  durationMin: number | null;
  nowMs: number;
}): InterviewClock {
  if (input.liveStartedAtMs === null) return NOT_STARTED;

  // A clock that has not started cannot have run backwards. Guards against a
  // client whose wall clock is behind the server's, which would otherwise show
  // a negative elapsed time.
  const elapsedMs = Math.max(0, input.nowMs - input.liveStartedAtMs);

  if (!input.durationMin || input.durationMin <= 0) {
    // No budget, so no countdown. Showing "00:00 left" here would be a limit
    // the interview does not actually have.
    return { anchored: true, elapsedMs, remainingMs: null, expired: false };
  }

  const budgetMs = input.durationMin * 60_000;
  const remainingMs = Math.max(0, budgetMs - elapsedMs);

  return {
    anchored: true,
    elapsedMs,
    remainingMs,
    expired: remainingMs === 0,
  };
}

/** mm:ss. Hours are folded in rather than truncated. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
