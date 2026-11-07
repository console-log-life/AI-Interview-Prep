import { describe, expect, it } from "vitest";

import {
  DEFAULT_TURN_CONFIG,
  advanceTurn,
  candidateIsSpeaking,
  frameEnergy,
  resetTurn,
  type TurnDetectorState,
  type TurnSignal,
} from "@/lib/ai/live/turn-taking";

/**
 * Candidate turn detection.
 *
 * The behaviour that matters is "genuinely listens": a thinking pause must not
 * end the turn, and the turn must end reliably when the candidate is actually
 * done. Both are testable without audio because the detector takes energy as
 * an input rather than reading a microphone.
 */

const CONFIG = DEFAULT_TURN_CONFIG;
const FRAME_MS = 128;
const LOUD = CONFIG.energyThreshold * 3;
const QUIET = CONFIG.energyThreshold / 4;

/** Feeds frames and returns the signals emitted, in order. */
function feed(
  state: TurnDetectorState,
  frames: Array<{ energy: number; count: number }>,
  startMs = 0,
) {
  let current = state;
  let now = startMs;
  const signals: TurnSignal[] = [];

  for (const { energy, count } of frames) {
    for (let i = 0; i < count; i += 1) {
      const result = advanceTurn(current, { energy, frameMs: FRAME_MS, nowMs: now }, CONFIG);
      current = result.state;
      if (result.signal.type !== "NONE") signals.push(result.signal);
      now += FRAME_MS;
    }
  }
  return { state: current, signals, now };
}

/** Frames needed to span a duration. */
const framesFor = (ms: number) => Math.ceil(ms / FRAME_MS) + 1;

describe("frameEnergy", () => {
  it("is zero for silence", () => {
    expect(frameEnergy(new Float32Array(128))).toBe(0);
  });

  it("rises with amplitude", () => {
    const quiet = new Float32Array(128).fill(0.01);
    const loud = new Float32Array(128).fill(0.5);
    expect(frameEnergy(loud)).toBeGreaterThan(frameEnergy(quiet));
  });

  it("reports a click far below its peak, but not below threshold", () => {
    // RMS heavily attenuates an impulse — one full-scale sample in 128 reads
    // as ~0.088 rather than 1.0. It is still above the speech threshold,
    // which is precisely why energy alone cannot reject a click: the
    // `minSpeechMs` duration gate is what does that (tested below).
    const click = new Float32Array(128);
    click[0] = 1;
    const energy = frameEnergy(click);

    expect(energy).toBeLessThan(0.1);
    expect(energy).toBeGreaterThan(CONFIG.energyThreshold);
  });

  it("handles an empty frame", () => {
    expect(frameEnergy(new Float32Array(0))).toBe(0);
  });
});

describe("speech start", () => {
  it("does not open the turn on a brief noise", () => {
    // A cough or a chair creak must not interrupt the interviewer.
    const { signals } = feed(resetTurn(), [{ energy: LOUD, count: 1 }]);
    expect(signals).toHaveLength(0);
  });

  it("opens the turn once speech is sustained", () => {
    const { signals } = feed(resetTurn(), [
      { energy: LOUD, count: framesFor(CONFIG.minSpeechMs) },
    ]);
    expect(signals).toEqual([{ type: "SPEECH_START" }]);
  });

  it("opens the turn exactly once", () => {
    const { signals } = feed(resetTurn(), [{ energy: LOUD, count: 40 }]);
    expect(signals.filter((s) => s.type === "SPEECH_START")).toHaveLength(1);
  });

  it("does not accumulate scattered noise into speech", () => {
    // Alternating single loud frames should never reach the threshold, because
    // silence resets the accumulator before it is trusted.
    let state = resetTurn();
    const signals: TurnSignal[] = [];
    let now = 0;
    for (let i = 0; i < 40; i += 1) {
      const result = advanceTurn(
        state,
        { energy: i % 2 === 0 ? LOUD : QUIET, frameMs: FRAME_MS, nowMs: now },
        CONFIG,
      );
      state = result.state;
      if (result.signal.type !== "NONE") signals.push(result.signal);
      now += FRAME_MS;
    }
    expect(signals).toHaveLength(0);
  });
});

describe("thinking pauses do not end the turn", () => {
  it("survives a pause shorter than the silence threshold", () => {
    // The central requirement: someone recalling a fact stops mid-sentence.
    const { state, signals } = feed(resetTurn(), [
      { energy: LOUD, count: framesFor(CONFIG.minSpeechMs) },
      { energy: QUIET, count: Math.floor(CONFIG.silenceMs / FRAME_MS / 2) },
      { energy: LOUD, count: 10 },
    ]);

    expect(signals.filter((s) => s.type === "SPEECH_END")).toHaveLength(0);
    expect(state.phase).toBe("SPEAKING");
  });

  it("survives several pauses in one answer", () => {
    let result = feed(resetTurn(), [
      { energy: LOUD, count: framesFor(CONFIG.minSpeechMs) },
    ]);
    for (let i = 0; i < 3; i += 1) {
      result = feed(
        result.state,
        [
          { energy: QUIET, count: Math.floor(CONFIG.silenceMs / FRAME_MS / 2) },
          { energy: LOUD, count: 8 },
        ],
        result.now,
      );
    }
    expect(result.signals.filter((s) => s.type === "SPEECH_END")).toHaveLength(0);
  });

  it("reports the candidate as still holding the floor during a pause", () => {
    const { state } = feed(resetTurn(), [
      { energy: LOUD, count: framesFor(CONFIG.minSpeechMs) },
      { energy: QUIET, count: 3 },
    ]);
    expect(state.phase).toBe("TRAILING_SILENCE");
    expect(candidateIsSpeaking(state)).toBe(true);
  });
});

describe("measured pause scenarios", () => {
  /** Speaks, pauses for `pauseMs`, speaks again. Returns the turns detected. */
  function pauseScenario(pauseMs: number) {
    const { signals } = feed(resetTurn(), [
      { energy: LOUD, count: framesFor(1000) },
      { energy: QUIET, count: framesFor(pauseMs) },
      { energy: LOUD, count: framesFor(1500) },
      { energy: QUIET, count: framesFor(CONFIG.silenceMs + 500) },
    ]);
    return signals.filter((s) => s.type === "SPEECH_END").length;
  }

  it("TEST A — a 1s pause mid-sentence stays one answer", () => {
    // "I would use PostgreSQL because…" [1s] "…we need transactional
    // consistency."
    expect(pauseScenario(1000)).toBe(1);
  });

  it("TEST B — a 2s pause mid-sentence stays one answer", () => {
    // "I would probably…" [2s] "…use Redis for caching."
    // This is the regression: against a live session at silenceMs=1800 this
    // split into two answers and the interviewer replied to the fragment
    // "I would probably".
    expect(pauseScenario(2000)).toBe(1);
  });

  it("still ends the turn once the candidate has genuinely finished", () => {
    // The patience must not become an inability to detect the end.
    const { signals } = feed(resetTurn(), [
      { energy: LOUD, count: framesFor(1500) },
      { energy: QUIET, count: framesFor(CONFIG.silenceMs + 500) },
    ]);
    expect(signals.filter((s) => s.type === "SPEECH_END")).toHaveLength(1);
  });

  it("does end the turn on a pause longer than the threshold", () => {
    // The counterpart to TEST B: patience is bounded. Fed speech then silence
    // alone — no second burst — the turn must close, and close during the
    // pause rather than waiting indefinitely.
    let state = resetTurn();
    let now = 0;
    let endedAtMs: number | null = null;

    for (const energy of [
      ...Array(framesFor(1000)).fill(LOUD),
      ...Array(framesFor(3200)).fill(QUIET),
    ]) {
      const result = advanceTurn(state, { energy, frameMs: FRAME_MS, nowMs: now }, CONFIG);
      state = result.state;
      if (result.signal.type === "SPEECH_END" && endedAtMs === null) endedAtMs = now;
      now += FRAME_MS;
    }

    expect(endedAtMs).not.toBeNull();
    // Fires once the silence threshold is met, not at the end of the feed.
    expect(endedAtMs!).toBeLessThan(1000 + 3200);
  });
});

describe("speech end", () => {
  it("ends the turn after the full silence threshold", () => {
    const { signals } = feed(resetTurn(), [
      { energy: LOUD, count: framesFor(CONFIG.minSpeechMs) },
      { energy: QUIET, count: framesFor(CONFIG.silenceMs) },
    ]);
    expect(signals.at(-1)).toEqual({ type: "SPEECH_END", reason: "SILENCE" });
  });

  it("emits SPEECH_END only once", () => {
    const { signals } = feed(resetTurn(), [
      { energy: LOUD, count: framesFor(CONFIG.minSpeechMs) },
      { energy: QUIET, count: framesFor(CONFIG.silenceMs) + 30 },
    ]);
    expect(signals.filter((s) => s.type === "SPEECH_END")).toHaveLength(1);
  });

  it("never ends a turn that never started", () => {
    const { signals, state } = feed(resetTurn(), [{ energy: QUIET, count: 200 }]);
    expect(signals).toHaveLength(0);
    expect(state.phase).toBe("IDLE");
  });

  it("ends a runaway turn so the interview cannot hang", () => {
    // A stuck microphone or constant background noise must still terminate.
    const { signals } = feed(resetTurn(), [
      { energy: LOUD, count: framesFor(CONFIG.maxTurnMs) + 5 },
    ]);
    expect(signals.at(-1)).toEqual({ type: "SPEECH_END", reason: "MAX_DURATION" });
  });

  it("stays ended until reset", () => {
    const ended = feed(resetTurn(), [
      { energy: LOUD, count: framesFor(CONFIG.minSpeechMs) },
      { energy: QUIET, count: framesFor(CONFIG.silenceMs) },
    ]);
    const after = feed(ended.state, [{ energy: LOUD, count: 40 }], ended.now);
    expect(after.signals).toHaveLength(0);
    expect(after.state.phase).toBe("ENDED");
  });

  it("can detect a fresh turn after a reset", () => {
    const { signals } = feed(resetTurn(), [
      { energy: LOUD, count: framesFor(CONFIG.minSpeechMs) },
    ]);
    expect(signals).toEqual([{ type: "SPEECH_START" }]);
  });
});

describe("configurable patience", () => {
  it("a longer silence threshold tolerates a longer pause", () => {
    const patient = { ...CONFIG, silenceMs: 4000 };
    let state = resetTurn();
    let now = 0;
    const signals: TurnSignal[] = [];

    // Speak, then pause for 2.5s — under the patient threshold.
    for (const energy of [
      ...Array(framesFor(CONFIG.minSpeechMs)).fill(LOUD),
      ...Array(framesFor(2500)).fill(QUIET),
    ]) {
      const result = advanceTurn(state, { energy, frameMs: FRAME_MS, nowMs: now }, patient);
      state = result.state;
      if (result.signal.type !== "NONE") signals.push(result.signal);
      now += FRAME_MS;
    }

    expect(signals.filter((s) => s.type === "SPEECH_END")).toHaveLength(0);
  });
});
