import { describe, expect, it } from "vitest";

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
 * Guards on the conversational loop.
 *
 * These cover the two ways the interviewer was talking when it should have
 * been listening: interrupting itself on room noise, and replying to a
 * candidate who had only said "um".
 */

const FRAME_MS = 128;
const LOUD = DEFAULT_TURN_CONFIG.energyThreshold * 3;
const QUIET = DEFAULT_TURN_CONFIG.energyThreshold / 4;

/** Feeds frames through the real detector and returns the signals emitted. */
function feed(
  segments: Array<{ energy: number; ms: number }>,
  config = DEFAULT_TURN_CONFIG,
): TurnSignal[] {
  let state: TurnDetectorState = resetTurn();
  let now = 0;
  const signals: TurnSignal[] = [];

  for (const segment of segments) {
    for (let i = 0; i < Math.ceil(segment.ms / FRAME_MS); i += 1) {
      const result = advanceTurn(
        state,
        { energy: segment.energy, frameMs: FRAME_MS, nowMs: now },
        config,
      );
      state = result.state;
      if (result.signal.type !== "NONE") signals.push(result.signal);
      now += FRAME_MS;
    }
  }
  return signals;
}

describe("interrupting the interviewer takes more than a noise", () => {
  /** The threshold applied while the interviewer's audio is playing. */
  const whileAiSpeaking = {
    ...DEFAULT_TURN_CONFIG,
    minSpeechMs: BARGE_IN_MIN_SPEECH_MS,
  };

  it("demands more sustained speech than starting a turn does", () => {
    // The whole point: the bar to cut the interviewer off is higher than the
    // bar to begin answering once the floor is already yours.
    expect(BARGE_IN_MIN_SPEECH_MS).toBeGreaterThan(DEFAULT_TURN_CONFIG.minSpeechMs);
  });

  it("ignores a cough while the interviewer is speaking", () => {
    // 300ms of noise cleared the old 180ms bar, opened an activity window and
    // cut the interviewer off mid-question.
    expect(feed([{ energy: LOUD, ms: 300 }], whileAiSpeaking)).toHaveLength(0);
  });

  it("still lets a real barge-in through", () => {
    const signals = feed(
      [{ energy: LOUD, ms: BARGE_IN_MIN_SPEECH_MS + 400 }],
      whileAiSpeaking,
    );
    expect(signals.some((s) => s.type === "SPEECH_START")).toBe(true);
  });

  it("does not delay the candidate once the floor is theirs", () => {
    // With the interviewer silent the normal threshold applies, so the first
    // syllable is not swallowed.
    const signals = feed([{ energy: LOUD, ms: 300 }], DEFAULT_TURN_CONFIG);
    expect(signals.some((s) => s.type === "SPEECH_START")).toBe(true);
  });

  it("emits nothing at all for noise that starts and stops", () => {
    // A chair creak followed by silence must leave no trace: no activity
    // window opened, and so no spurious turn to finalize afterwards.
    const signals = feed(
      [
        { energy: LOUD, ms: 300 },
        { energy: QUIET, ms: DEFAULT_TURN_CONFIG.silenceMs + 500 },
      ],
      whileAiSpeaking,
    );
    expect(signals).toHaveLength(0);
  });

  it("closes the turn normally once a real barge-in ends", () => {
    const signals = feed(
      [
        { energy: LOUD, ms: BARGE_IN_MIN_SPEECH_MS + 400 },
        { energy: QUIET, ms: DEFAULT_TURN_CONFIG.silenceMs + 500 },
      ],
      whileAiSpeaking,
    );
    expect(signals.map((s) => s.type)).toEqual(["SPEECH_START", "SPEECH_END"]);
  });

  it("keeps the barge-in bar well under a second", () => {
    // Any higher and interrupting stops feeling responsive.
    expect(BARGE_IN_MIN_SPEECH_MS).toBeLessThanOrEqual(800);
  });
});

describe("a hesitation is not an answer", () => {
  it.each([
    "um",
    "uh",
    "hmm",
    "um...",
    "uh, um",
    "let me think",
    "so...",
    "well",
    "actually",
    "wait",
    "okay",
    "hmm, let me think a second",
  ])("treats %p as hesitation", (text) => {
    expect(isHesitationOnly(text)).toBe(true);
  });

  it.each([
    "Transactions.",
    "um, indexes",
    "I would use Redis",
    "Postgres, because we needed transactions",
    "well, I would shard by tenant",
  ])("treats %p as a real answer", (text) => {
    expect(isHesitationOnly(text)).toBe(false);
  });

  it("treats an empty or noise-only turn as hesitation", () => {
    // Same downstream handling: the candidate has not taken their turn.
    expect(isHesitationOnly("")).toBe(true);
    expect(isHesitationOnly("<noise>")).toBe(true);
    expect(isHesitationOnly("...")).toBe(true);
  });

  it("does not swallow a short but genuine answer", () => {
    // The failure to avoid in the other direction: "Transactions." is a real,
    // if thin, answer and must reach the interviewer.
    expect(isHesitationOnly("Transactions")).toBe(false);
    expect(isHesitationOnly("Yes")).toBe(false);
    expect(isHesitationOnly("Redis")).toBe(false);
  });
});
