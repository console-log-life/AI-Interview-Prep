/**
 * Input-transcription accumulator — pure, no SDK, no timers.
 *
 * Exists because of two measured facts about the Gemini Live API that together
 * caused every candidate answer to be truncated:
 *
 * 1. **`inputTranscription.text` is a delta, not a snapshot.** A single sentence
 *    arrives as `" I"`, `" AM"`, `" A"`, `" SO"`, `"FTWA"`, `"RE"`, … Assigning
 *    each message over the previous one leaves you holding the last fragment —
 *    `"ING"` where the answer was "I am a software engineering student".
 *
 * 2. **`finished` is never set.** Across every run observed it stayed
 *    `undefined`, so completion cannot be detected from the flag the type
 *    definition advertises. It has to be inferred from the fragments stopping.
 *
 * Keeping this pure is what lets the exact observed sequence — including the
 * tail that arrives *after* `activityEnd` — be replayed in a unit test with no
 * network and no clock.
 */

export type TranscriptBuffer = {
  /** Fragments in arrival order. */
  parts: readonly string[];
  /** When the most recent fragment arrived. Zero when none has. */
  lastFragmentAtMs: number;
};

export type StabilityConfig = {
  /** Quiet time after which the utterance is treated as complete. */
  stableMs: number;
  /**
   * Minimum time to wait for the flush to deliver anything at all.
   *
   * Necessary because the quiet-time rule alone is wrong here. Transcription
   * stalls *before* `activityEnd` — in the measured run the last fragment
   * landed at 5691ms and the flush was sent at 6894ms — so by the time the wait
   * begins the buffer has already been quiet for longer than `stableMs`, and a
   * naive quiet check reports the answer complete before its tail exists.
   *
   * So until a fragment arrives *after* the wait started, completion is decided
   * by this grace period instead.
   */
  postFlushGraceMs: number;
  /** Ceiling on the whole wait, so a stalled transcription cannot hang. */
  maxWaitMs: number;
};

export const EMPTY_BUFFER: TranscriptBuffer = { parts: [], lastFragmentAtMs: 0 };

export function resetBuffer(): TranscriptBuffer {
  return { parts: [], lastFragmentAtMs: 0 };
}

/** Records a fragment. Empty fragments are ignored rather than stored. */
export function appendFragment(
  buffer: TranscriptBuffer,
  text: string,
  nowMs: number,
): TranscriptBuffer {
  if (!text) return buffer;
  return {
    parts: [...buffer.parts, text],
    lastFragmentAtMs: nowMs,
  };
}

/**
 * The assembled utterance.
 *
 * Joined with no separator: the deltas carry their own leading spaces, and
 * inserting more would split `"SO"` + `"FTWA"` + `"RE"` into three words.
 * Whitespace is then normalized, because the fragment boundaries produce
 * doubled and trailing spaces that would otherwise reach the word count and
 * the transcript panel.
 */
export function assembled(buffer: TranscriptBuffer): string {
  return buffer.parts.join("").replace(/\s+/g, " ").trim();
}

export type TranscriptOutcome =
  /** Still arriving; keep waiting. */
  | "PENDING"
  /** Gone quiet long enough to treat as complete. */
  | "STABLE"
  /** Hit the ceiling. Use what arrived; do not wait longer. */
  | "CAPPED";

/**
 * Whether the utterance can be considered complete.
 *
 * Three signals, in order of how much they can be trusted:
 *
 * - **`serverTurnComplete`** — the server closed the turn. Fast, measured
 *   landing 1ms after the final fragment, but only trusted once a fragment has
 *   actually arrived since the flush: the API disclaims any ordering between
 *   transcription and the model turn, so it is corroborated rather than
 *   believed outright.
 * - **Quiet time** — no fragment for `stableMs`. A heuristic, and a delicate
 *   one: transcription arrives with the same temporal shape as the speech, so
 *   a candidate's own thinking pause reappears as a gap in the fragment
 *   stream. A 1085ms gap was measured mid-utterance from a 1s spoken pause,
 *   which is why `stableMs` must exceed the longest pause turn detection
 *   tolerates, or a slow speaker gets their answer cut in half.
 * - **Elapsed time** — the cap. A last resort that bounds the wait.
 *
 * Two regimes apply to the quiet rule, because the stream behaves differently
 * either side of the flush:
 *
 * - **Nothing has arrived since the wait began.** The flush may still be about
 *   to deliver the tail. Measured delays between `activityEnd` and the final
 *   fragment ran 514–1922ms, so we hold for `postFlushGraceMs` before accepting
 *   that nothing more is coming.
 * - **Something has arrived since the wait began.** Now the ordinary quiet rule
 *   applies: once no fragment has landed for `stableMs`, the utterance is done.
 *
 * A buffer that has never received anything at all is never `STABLE` — it is
 * empty, and conflating the two would finalize a silent turn as an empty answer.
 */
export function transcriptOutcome(
  buffer: TranscriptBuffer,
  timing: {
    waitStartedAtMs: number;
    nowMs: number;
    /**
     * The server closed the turn since the flush.
     *
     * The strongest completion signal available, and the only one that is not
     * a guess: measured arriving 1ms after the final fragment. Timers are the
     * fallback for when it is slow, not the primary mechanism.
     */
    serverTurnComplete?: boolean;
  },
  config: StabilityConfig,
): TranscriptOutcome {
  const elapsed = timing.nowMs - timing.waitStartedAtMs;

  if (elapsed >= config.maxWaitMs) return "CAPPED";

  const tailArrived = buffer.lastFragmentAtMs > timing.waitStartedAtMs;

  // The server says the turn is closed and the transcription flushed with it.
  //
  // Gated on a fragment having actually arrived since the flush. `turnComplete`
  // was measured landing 1ms after the final fragment, but 1ms of margin is not
  // an ordering guarantee — and the API documents transcription as "independent
  // to the model turn", explicitly disclaiming any ordering. Accepting it
  // before the tail has appeared would reintroduce the exact truncation this
  // module exists to prevent, so when it arrives early the timers still apply.
  if (timing.serverTurnComplete && tailArrived) return "STABLE";

  if (!tailArrived) {
    // Still inside the window where the flush might deliver. Give up only once
    // the grace period has passed, and only if we have something to work with.
    return elapsed >= config.postFlushGraceMs && buffer.parts.length > 0
      ? "STABLE"
      : "PENDING";
  }

  return timing.nowMs - buffer.lastFragmentAtMs >= config.stableMs
    ? "STABLE"
    : "PENDING";
}
