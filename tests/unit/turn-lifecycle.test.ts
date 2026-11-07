import { describe, expect, it } from "vitest";

import {
  MIN_SILENCE_DURATION_MS,
  PERSONA_TUNING,
  TRANSCRIPT_MAX_WAIT_MS,
  TRANSCRIPT_POST_FLUSH_GRACE_MS,
  TRANSCRIPT_STABLE_MS,
  safeSilenceDuration,
} from "@/lib/ai/live/config";
import {
  isConversationalRepair,
  staysOnTopic,
} from "@/lib/ai/live/intent-directives";
import {
  appendFragment,
  assembled,
  resetBuffer,
  transcriptOutcome,
  type TranscriptBuffer,
} from "@/lib/ai/live/transcript-buffer";
import {
  DEFAULT_TURN_CONFIG,
  advanceTurn,
  resetTurn,
  type TurnDetectorState,
  type TurnSignal,
} from "@/lib/ai/live/turn-taking";
import { deriveIntent, understandAnswer } from "@/lib/ai/live/understanding";

/**
 * End-to-end candidate turn lifecycle, deterministically.
 *
 * These reproduce the scenarios that were exercised against live speech, but
 * driven by the same pure functions the browser client calls — so they cover
 * the cases the TTS quota blocked, and they keep covering them once the quota
 * resets and nobody re-runs the harness.
 *
 * What they do NOT cover: real audio, real transcription accuracy, real
 * network timing. A pass here means the logic is right, not that a microphone
 * works.
 */

const FRAME_MS = 128;
const LOUD = DEFAULT_TURN_CONFIG.energyThreshold * 3;
const QUIET = DEFAULT_TURN_CONFIG.energyThreshold / 4;

type Segment = { speech: boolean; ms: number };

/**
 * Runs an utterance through the real detector and returns the turns it found.
 *
 * Mirrors the client: on SPEECH_END the detector is reset so a following
 * utterance can be detected as its own turn, which is what makes "did this
 * split?" answerable.
 */
function detectTurns(segments: Segment[]): { turns: number; endsAtMs: number[] } {
  let state: TurnDetectorState = resetTurn();
  let now = 0;
  const endsAtMs: number[] = [];

  for (const segment of segments) {
    const frames = Math.ceil(segment.ms / FRAME_MS);
    for (let i = 0; i < frames; i += 1) {
      const result = advanceTurn(
        state,
        { energy: segment.speech ? LOUD : QUIET, frameMs: FRAME_MS, nowMs: now },
        DEFAULT_TURN_CONFIG,
      );
      state = result.state;
      const signal: TurnSignal = result.signal;
      if (signal.type === "SPEECH_END") {
        endsAtMs.push(now);
        state = resetTurn();
      }
      now += FRAME_MS;
    }
  }
  return { turns: endsAtMs.length, endsAtMs };
}

/** Drives the transcript buffer to completion the way the client does. */
function finalizeTranscript(args: {
  fragmentsBeforeFlush: Array<[number, string]>;
  flushAtMs: number;
  fragmentsAfterFlush: Array<[number, string]>;
  serverTurnCompleteAtMs?: number;
}): { answer: string; outcome: string; finalizedAtMs: number } {
  const config = {
    stableMs: TRANSCRIPT_STABLE_MS,
    postFlushGraceMs: TRANSCRIPT_POST_FLUSH_GRACE_MS,
    maxWaitMs: TRANSCRIPT_MAX_WAIT_MS,
  };

  let buffer: TranscriptBuffer = resetBuffer();
  for (const [atMs, text] of args.fragmentsBeforeFlush) {
    buffer = appendFragment(buffer, text, atMs);
  }

  const pending = [...args.fragmentsAfterFlush];
  let now = args.flushAtMs;

  // Step the clock the way the poll loop does, delivering fragments on time.
  for (;;) {
    while (pending.length > 0 && pending[0][0] <= now) {
      const [atMs, text] = pending.shift()!;
      buffer = appendFragment(buffer, text, atMs);
    }

    const outcome = transcriptOutcome(
      buffer,
      {
        waitStartedAtMs: args.flushAtMs,
        nowMs: now,
        serverTurnComplete:
          args.serverTurnCompleteAtMs !== undefined &&
          now >= args.serverTurnCompleteAtMs,
      },
      config,
    );

    if (outcome !== "PENDING") {
      return { answer: assembled(buffer), outcome, finalizedAtMs: now };
    }
    now += 50;
  }
}

describe("S3 — a 2 second thinking pause is one answer", () => {
  it("does not split the turn", () => {
    // The live failure: at silenceMs=1800 this produced two turns, and the
    // interviewer replied to the fragment "I would probably".
    const { turns } = detectTurns([
      { speech: true, ms: 900 }, // "I would probably"
      { speech: false, ms: 2000 }, // the pause
      { speech: true, ms: 1400 }, // "use Redis for caching."
      { speech: false, ms: DEFAULT_TURN_CONFIG.silenceMs + 400 },
    ]);
    expect(turns).toBe(1);
  });

  it("assembles both halves into one answer", () => {
    const { answer, outcome } = finalizeTranscript({
      fragmentsBeforeFlush: [
        [0, " I would"],
        [300, " probably"],
        // The 2s pause reappears as a hole in the fragment stream.
        [2400, " use Red"],
        [2700, "is for"],
        [3000, " caching."],
      ],
      flushAtMs: 3200,
      fragmentsAfterFlush: [],
      serverTurnCompleteAtMs: undefined,
    });

    expect(answer).toBe("I would probably use Redis for caching.");
    expect(outcome).toBe("STABLE");
  });

  it("does not finalize inside the 2 second hole", () => {
    // If the flush landed mid-pause, the stabilization window must not expire
    // before the rest of the answer arrives.
    const { answer } = finalizeTranscript({
      fragmentsBeforeFlush: [
        [0, " I would"],
        [300, " probably"],
      ],
      flushAtMs: 400,
      fragmentsAfterFlush: [
        [2400, " use Redis for caching."],
      ],
    });
    expect(answer).toContain("Redis");
  });

  it("produces exactly one understanding and one decision", () => {
    const answer = "I would probably use Redis for caching.";
    const understanding = understandAnswer(answer, "How would you speed it up?");
    const intent = deriveIntent(understanding);

    expect(isConversationalRepair(intent)).toBe(false);
    // Deterministic: the same answer cannot yield two different decisions.
    expect(deriveIntent(understandAnswer(answer, "How would you speed it up?"))).toBe(
      intent,
    );
  });
});

describe("S5 — self-correction", () => {
  const CORRECTED =
    "I would use MySQL. Actually, PostgreSQL would be better because we need stronger transactional guarantees.";

  it("keeps the correction and the abandoned statement in one turn", () => {
    const { turns } = detectTurns([
      { speech: true, ms: 1200 }, // "I would use MySQL."
      { speech: false, ms: 1200 }, // the beat before correcting
      { speech: true, ms: 2600 }, // "Actually, PostgreSQL would be better…"
      { speech: false, ms: DEFAULT_TURN_CONFIG.silenceMs + 400 },
    ]);
    expect(turns).toBe(1);
  });

  it("assembles the full corrected answer", () => {
    const { answer } = finalizeTranscript({
      fragmentsBeforeFlush: [
        [0, " I would use"],
        [300, " MySQL."],
        [1600, " Actually,"],
        [1900, " Postgre"],
        [2100, "SQL would be better"],
      ],
      flushAtMs: 2400,
      fragmentsAfterFlush: [
        [3000, " because we need stronger transactional guarantees."],
      ],
      serverTurnCompleteAtMs: 3010,
    });

    expect(answer).toBe(CORRECTED);
    expect(answer).toContain("PostgreSQL");
    expect(answer).toContain("transactional guarantees");
  });

  it("reads the reasoning attached to the corrected choice", () => {
    const understanding = understandAnswer(
      CORRECTED,
      "Which database would you choose?",
    );
    // The "because…" clause belongs to PostgreSQL, and it must survive.
    expect(understanding.reasoningPresent).toBe(true);
    expect(understanding.technologyMentioned).toContain("postgresql");
  });

  it("never claims which choice was correct", () => {
    // Both databases appear in the answer. Nothing here can establish which is
    // right, and the system must not pretend otherwise.
    expect(
      understandAnswer(CORRECTED, "Which database would you choose?").correctness,
    ).toBe("UNKNOWN");
  });
});

describe("empty transcription never fabricates an answer", () => {
  it("does not report an empty buffer as a complete answer", () => {
    const { outcome, answer } = finalizeTranscript({
      fragmentsBeforeFlush: [],
      flushAtMs: 0,
      fragmentsAfterFlush: [],
    });
    // Capped rather than stable, and empty rather than invented.
    expect(outcome).toBe("CAPPED");
    expect(answer).toBe("");
  });

  it("terminates rather than hanging when nothing is ever transcribed", () => {
    const { finalizedAtMs } = finalizeTranscript({
      fragmentsBeforeFlush: [],
      flushAtMs: 0,
      fragmentsAfterFlush: [],
    });
    expect(finalizedAtMs).toBeLessThanOrEqual(TRANSCRIPT_MAX_WAIT_MS + 100);
  });
});

describe("repeat requests do not advance the interview", () => {
  it.each([
    "Can you repeat the question?",
    "Could you say that again?",
    "I didn't hear the question.",
    "Sorry, what was the question?",
  ])("treats %p as a repair, not an answer", (text) => {
    const intent = deriveIntent(understandAnswer(text, "Why did you pick Postgres?"));
    expect(isConversationalRepair(intent)).toBe(true);
    // A repair keeps the interview on the current question.
    expect(staysOnTopic(intent)).toBe(true);
  });

  it("does not classify a real answer containing 'again' as a repeat", () => {
    const intent = deriveIntent(
      understandAnswer(
        "We ran the migration again after fixing the index, and the query time dropped from 900ms to 40ms.",
        "What did you do?",
      ),
    );
    expect(isConversationalRepair(intent)).toBe(false);
  });
});

describe("follow-ups stay attached to the answer", () => {
  it("does not release the topic while the answer is still thin", () => {
    const answer = "I would use PostgreSQL because we need transactional consistency.";
    const intent = deriveIntent(understandAnswer(answer, "Which database?"));

    // Anything other than SUFFICIENT keeps the interview on this thread, which
    // is what stops an unrelated question appearing next.
    expect(staysOnTopic(intent)).toBe(true);
    expect(isConversationalRepair(intent)).toBe(false);
  });

  it("picks a different follow-up shape than for a bare answer", () => {
    const reasoned = deriveIntent(
      understandAnswer(
        "I would use PostgreSQL because we need transactional consistency.",
        "Which database?",
      ),
    );
    const bare = deriveIntent(understandAnswer("PostgreSQL.", "Which database?"));
    expect(reasoned).not.toBe(bare);
  });
});

describe("timing relationships hold together", () => {
  it("every persona waits at least the floor", () => {
    for (const tuning of Object.values(PERSONA_TUNING)) {
      expect(tuning.silenceDurationMs).toBeGreaterThanOrEqual(MIN_SILENCE_DURATION_MS);
    }
  });

  it("the floor tolerates a 2 second thinking pause", () => {
    // The measured failure was a 2000ms pause. The floor must clear it.
    expect(MIN_SILENCE_DURATION_MS).toBeGreaterThan(2000);
    expect(safeSilenceDuration(1000)).toBeGreaterThan(2000);
  });

  it("the transcript window is not shorter than the pause the VAD allows", () => {
    // Otherwise the transcript finalizes inside a pause turn detection was
    // deliberately tolerating.
    expect(TRANSCRIPT_STABLE_MS).toBeGreaterThanOrEqual(DEFAULT_TURN_CONFIG.silenceMs);
  });

  it("the cap leaves room for the worst measured tail plus stabilization", () => {
    // Worst measured flush→tail was 3237ms.
    expect(TRANSCRIPT_MAX_WAIT_MS).toBeGreaterThan(3237);
  });

  it("the grace period clears the worst measured first-fragment delay", () => {
    // First post-flush fragment arrived at most 1430ms after the flush.
    expect(TRANSCRIPT_POST_FLUSH_GRACE_MS).toBeGreaterThan(1430);
  });

  it("does not wait so long that the interview stalls", () => {
    // Upper bound on dead air after the candidate stops: silence detection,
    // then transcript stabilization. Kept under ~10s deliberately.
    const worstCase = DEFAULT_TURN_CONFIG.silenceMs + TRANSCRIPT_MAX_WAIT_MS;
    expect(worstCase).toBeLessThanOrEqual(10_000);
  });
});
