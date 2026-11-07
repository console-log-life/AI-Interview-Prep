import { describe, expect, it } from "vitest";

import { HESITATION_GRACE_MS } from "@/lib/ai/live/config";
import { isHesitationOnly } from "@/lib/ai/live/noise";
import {
  BARGE_IN_MIN_SPEECH_MS,
  DEFAULT_TURN_CONFIG,
  advanceTurn,
  resetTurn,
  type TurnDetectorState,
  type TurnSignal,
} from "@/lib/ai/live/turn-taking";

/**
 * The two runtime defects that made the interview feel unlike a conversation.
 *
 * Neither was visible to the existing suite: both live in the gap between
 * "the detector is correct" and "the detector is asked the right question at
 * the right moment".
 */

const FRAME_MS = 128;
const LOUD = DEFAULT_TURN_CONFIG.energyThreshold * 3;
const QUIET = DEFAULT_TURN_CONFIG.energyThreshold / 4;

/** Feeds frames at a given `minSpeechMs`, returning the signals emitted. */
function feed(
  segments: Array<{ speech: boolean; ms: number }>,
  minSpeechMs: number,
): TurnSignal[] {
  let state: TurnDetectorState = resetTurn();
  const config = { ...DEFAULT_TURN_CONFIG, minSpeechMs };
  const signals: TurnSignal[] = [];
  let now = 0;

  for (const segment of segments) {
    for (let i = 0; i < Math.ceil(segment.ms / FRAME_MS); i += 1) {
      const result = advanceTurn(
        state,
        { energy: segment.speech ? LOUD : QUIET, frameMs: FRAME_MS, nowMs: now },
        config,
      );
      state = result.state;
      if (result.signal.type !== "NONE") signals.push(result.signal);
      now += FRAME_MS;
    }
  }
  return signals;
}

describe("noise must not cut the interviewer off", () => {
  it("a cough while the interviewer speaks does not open a turn", () => {
    // The defect: at the normal 180ms threshold, a cough, a keyboard press or
    // residual echo opened a candidate activity window — which interrupts the
    // model mid-question. The candidate saw the interviewer cut off halfway
    // through asking.
    const signals = feed([{ speech: true, ms: 300 }], BARGE_IN_MIN_SPEECH_MS);
    expect(signals).toHaveLength(0);
  });

  it("the same noise WOULD have opened a turn at the normal threshold", () => {
    // Proves the guard is doing the work, not the fixture.
    const signals = feed(
      [{ speech: true, ms: 300 }],
      DEFAULT_TURN_CONFIG.minSpeechMs,
    );
    expect(signals).toContainEqual({ type: "SPEECH_START" });
  });

  it("a genuine barge-in still interrupts", () => {
    // Someone actually talking over the interviewer sustains well past the
    // threshold, so interruption stays possible.
    const signals = feed(
      [{ speech: true, ms: BARGE_IN_MIN_SPEECH_MS + 400 }],
      BARGE_IN_MIN_SPEECH_MS,
    );
    expect(signals).toContainEqual({ type: "SPEECH_START" });
  });

  it("keeps the first syllable when the floor is already the candidate's", () => {
    // The stricter bar applies only while the interviewer is speaking; once it
    // is the candidate's turn, a short opening word must not be dropped.
    const signals = feed(
      [{ speech: true, ms: 250 }],
      DEFAULT_TURN_CONFIG.minSpeechMs,
    );
    expect(signals).toContainEqual({ type: "SPEECH_START" });
  });

  it("is a meaningfully higher bar, not a cosmetic one", () => {
    expect(BARGE_IN_MIN_SPEECH_MS).toBeGreaterThan(
      DEFAULT_TURN_CONFIG.minSpeechMs * 2,
    );
  });
});

describe("a filled pause is not an answer", () => {
  it.each([
    "um",
    "uh...",
    "hmm",
    "let me think",
    "so...",
    "well",
    "actually",
    "wait",
    "um, let me think a second",
    "you know",
  ])("treats %p as hesitation, not a turn", (text) => {
    expect(isHesitationOnly(text)).toBe(true);
  });

  it.each([
    "um, indexes",
    "so we sharded by tenant",
    "actually, PostgreSQL would be better",
    "I would use Redis",
    "transactions",
  ])("treats %p as a real answer", (text) => {
    expect(isHesitationOnly(text)).toBe(false);
  });

  it("does not swallow a one-word answer", () => {
    // "Transactions." is short, but it is an answer and must reach the
    // understanding layer so the interviewer can ask them to expand.
    expect(isHesitationOnly("Transactions.")).toBe(false);
  });

  it("treats a noise-only turn as hesitation too", () => {
    // Both mean the same thing downstream: the candidate has not answered.
    expect(isHesitationOnly("<noise>")).toBe(true);
    expect(isHesitationOnly("...")).toBe(true);
    expect(isHesitationOnly("")).toBe(true);
  });

  it("waits long enough for someone who said they are thinking", () => {
    // The grace must comfortably exceed the silence the detector already
    // tolerates, or it fires while the candidate is still gathering an answer.
    expect(HESITATION_GRACE_MS).toBeGreaterThan(DEFAULT_TURN_CONFIG.silenceMs * 2);
  });

  it("is bounded, so a candidate who never resumes cannot hang the interview", () => {
    expect(HESITATION_GRACE_MS).toBeLessThanOrEqual(15_000);
  });
});
