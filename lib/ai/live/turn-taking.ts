/**
 * Candidate turn detection — pure, no audio APIs.
 *
 * This exists because the interview loop has to invert control. With Gemini's
 * automatic activity detection the server begins generating its reply the
 * instant it hears end-of-speech, so any steering the controller sends arrives
 * *after* the model has already spoken. The orchestrator becomes a commentator.
 *
 * Owning the turn boundary is what fixes that: the client decides when the
 * candidate has finished, which creates the window to understand the answer and
 * steer *before* releasing the turn to the model.
 *
 * The cost is that turn detection is now our problem, and getting it wrong is
 * very visible — cut a candidate off mid-thought and the interview feels
 * hostile; wait too long and it feels dead. Hence a real state machine with
 * named thresholds rather than a bare silence timer.
 */

export type SpeechPhase =
  /** No speech since the interviewer stopped. */
  | "IDLE"
  /** Energy above threshold, but not yet long enough to trust. */
  | "MAYBE_SPEAKING"
  /** Confirmed speech in progress. */
  | "SPEAKING"
  /** Speech stopped, waiting to see whether it is a pause or the end. */
  | "TRAILING_SILENCE"
  /** Turn is over; the candidate is done. */
  | "ENDED";

export type TurnDetectorConfig = {
  /**
   * RMS above which a frame counts as speech.
   *
   * Deliberately low. A false positive costs one extra `activityStart`, which
   * the model tolerates; a false negative loses the first syllable of an
   * answer, which the candidate hears as being ignored.
   */
  energyThreshold: number;
  /**
   * Speech required before a start is trusted.
   *
   * Filters coughs, chair creaks and keyboard noise without delaying a real
   * answer perceptibly.
   */
  minSpeechMs: number;
  /**
   * Silence required before the turn is considered finished.
   *
   * The single most consequential number in the feature. A technical answer
   * contains real thinking pauses — someone recalling the four Coffman
   * conditions stops for a second mid-sentence — so this is far longer than a
   * chat assistant would use.
   *
   * Raised from 1800ms after a measured failure: a deliberate 2s pause in
   * "I would probably… use Redis for caching" was split into two answers,
   * and the interviewer answered the fragment "I would probably". The floor
   * has to sit above the longest pause a thinking candidate actually takes,
   * and 2s is well within normal. The cost is that genuine end-of-answer is
   * recognised 700ms later, which is the right trade: being cut off mid-thought
   * is far worse than a beat of extra silence.
   */
  silenceMs: number;
  /**
   * Hard ceiling on one turn.
   *
   * Not a cutoff for its own sake: without it, a stuck microphone or constant
   * background noise means the turn never ends and the interview hangs.
   */
  maxTurnMs: number;
};

/**
 * Speech required to interrupt the interviewer, as opposed to to start a turn.
 *
 * Deliberately far longer than `minSpeechMs`. While the interviewer is
 * speaking, the microphone hears keyboard noise, chair movement, a cough, and
 * whatever echo cancellation did not remove — and 180ms of any of those was
 * enough to open a candidate activity window, which *interrupts the model
 * mid-question*. The candidate experiences the interviewer being cut off
 * halfway through asking, then answering a turn they never took.
 *
 * A real barge-in is someone talking over the interviewer, which sustains well
 * past half a second. Requiring that much makes interruption deliberate
 * without making it feel sluggish.
 */
export const BARGE_IN_MIN_SPEECH_MS = 600;

export const DEFAULT_TURN_CONFIG: TurnDetectorConfig = {
  energyThreshold: 0.012,
  minSpeechMs: 180,
  silenceMs: 2500,
  maxTurnMs: 180_000,
};

export type TurnDetectorState = {
  phase: SpeechPhase;
  /** When the current speech run began. */
  speechStartedAtMs: number | null;
  /** When the current silence run began. */
  silenceStartedAtMs: number | null;
  /** Continuous speech duration accumulated this turn. */
  speechMs: number;
  /** True once we have emitted activityStart for this turn. */
  activityOpen: boolean;
};

export const INITIAL_TURN_STATE: TurnDetectorState = {
  phase: "IDLE",
  speechStartedAtMs: null,
  silenceStartedAtMs: null,
  speechMs: 0,
  activityOpen: false,
};

/** What the caller should do as a result of this frame. */
export type TurnSignal =
  | { type: "NONE" }
  /** Open the candidate's turn upstream. */
  | { type: "SPEECH_START" }
  /** Close it: the candidate has finished. */
  | { type: "SPEECH_END"; reason: "SILENCE" | "MAX_DURATION" };

/**
 * Root-mean-square energy of a PCM frame.
 *
 * RMS rather than peak, which heavily attenuates an impulse: one full-scale
 * sample in a 128-frame reads as ~0.088 rather than 1.0. Note that this is
 * still above the speech threshold — energy alone does NOT reject a click.
 * What rejects it is `minSpeechMs`, which requires the energy to persist.
 */
export function frameEnergy(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

/**
 * Advances the detector by one audio frame.
 *
 * Pure: the caller supplies the frame energy, the frame duration and a
 * monotonic clock, so the whole of turn-taking is testable without audio.
 */
export function advanceTurn(
  state: TurnDetectorState,
  input: { energy: number; frameMs: number; nowMs: number },
  config: TurnDetectorConfig = DEFAULT_TURN_CONFIG,
): { state: TurnDetectorState; signal: TurnSignal } {
  const isSpeech = input.energy >= config.energyThreshold;

  // A turn that has already ended stays ended until the caller resets it.
  if (state.phase === "ENDED") return { state, signal: { type: "NONE" } };

  // Runaway guard. Checked first so a permanently noisy input still ends.
  if (
    state.activityOpen &&
    state.speechStartedAtMs !== null &&
    input.nowMs - state.speechStartedAtMs >= config.maxTurnMs
  ) {
    return {
      state: { ...state, phase: "ENDED" },
      signal: { type: "SPEECH_END", reason: "MAX_DURATION" },
    };
  }

  if (isSpeech) {
    const speechMs = state.speechMs + input.frameMs;
    const speechStartedAtMs = state.speechStartedAtMs ?? input.nowMs;

    // Speech resumed during a pause — this was thinking time, not the end.
    // Returning to SPEAKING without re-emitting SPEECH_START is what lets a
    // candidate pause mid-sentence without the interviewer jumping in.
    if (state.phase === "TRAILING_SILENCE") {
      return {
        state: {
          ...state,
          phase: "SPEAKING",
          silenceStartedAtMs: null,
          speechMs,
        },
        signal: { type: "NONE" },
      };
    }

    // Not yet enough speech to trust it.
    if (speechMs < config.minSpeechMs) {
      return {
        state: {
          ...state,
          phase: "MAYBE_SPEAKING",
          speechStartedAtMs,
          silenceStartedAtMs: null,
          speechMs,
        },
        signal: { type: "NONE" },
      };
    }

    // Confirmed. Open the turn once.
    if (!state.activityOpen) {
      return {
        state: {
          ...state,
          phase: "SPEAKING",
          speechStartedAtMs,
          silenceStartedAtMs: null,
          speechMs,
          activityOpen: true,
        },
        signal: { type: "SPEECH_START" },
      };
    }

    return {
      state: {
        ...state,
        phase: "SPEAKING",
        silenceStartedAtMs: null,
        speechMs,
      },
      signal: { type: "NONE" },
    };
  }

  // --- silence -------------------------------------------------------------

  // Silence before any confirmed speech is just an empty room.
  if (!state.activityOpen) {
    return {
      state: {
        ...state,
        phase: "IDLE",
        // Reset the accumulator so scattered noise never adds up to speech.
        speechMs: 0,
        speechStartedAtMs: null,
        silenceStartedAtMs: null,
      },
      signal: { type: "NONE" },
    };
  }

  const silenceStartedAtMs = state.silenceStartedAtMs ?? input.nowMs;
  const silenceElapsed = input.nowMs - silenceStartedAtMs;

  if (silenceElapsed >= config.silenceMs) {
    return {
      state: { ...state, phase: "ENDED", silenceStartedAtMs },
      signal: { type: "SPEECH_END", reason: "SILENCE" },
    };
  }

  return {
    state: { ...state, phase: "TRAILING_SILENCE", silenceStartedAtMs },
    signal: { type: "NONE" },
  };
}

/** Fresh detector for the next turn. */
export function resetTurn(): TurnDetectorState {
  return { ...INITIAL_TURN_STATE };
}

/** Whether the candidate is currently holding the floor. */
export function candidateIsSpeaking(state: TurnDetectorState): boolean {
  return (
    state.phase === "SPEAKING" ||
    state.phase === "MAYBE_SPEAKING" ||
    state.phase === "TRAILING_SILENCE"
  );
}
